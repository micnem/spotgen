#!/usr/bin/env node

/* eslint-disable no-unused-vars */
var async = require('async')
var fs = require('fs')
var request = require('request')

var defaults = require('./defaults')
var lastfm = require('./lastfm')(defaults.api)

var spotify = {}

/**
 * Represents a playlist.
 * @constructor
 * @param {string} str - The playlist as a string.
 */
spotify.Playlist = function (str) {
  /**
   * Playlist order.
   */
  this.ordering = null

  /**
   * Playlist grouping.
   */
  this.grouping = true

  /**
   * Unique flag.
   */
  this.unique = true

  /**
   * List of entries.
   */
  this.entries = new spotify.Queue()

  str = str.trim()
  if (str !== '') {
    var lines = str.split(/\r|\n|\r\n/)
    while (lines.length > 0) {
      var line = lines.shift()
      if (line.match(/^#ORDER BY POPULARITY/i)) {
        this.ordering = 'popularity'
      } else if (line.match(/^#(SORT|ORDER) BY LAST.?FM/i)) {
        this.ordering = 'lastfm'
      } else if (line.match(/^#GROUP BY ENTRY/i)) {
        this.grouping = 'entry'
      } else if (line.match(/^#GROUP BY ARTIST/i)) {
        this.grouping = 'artist'
      } else if (line.match(/^#GROUP BY ALBUM/i)) {
        this.grouping = 'album'
      } else if (line.match(/^#UNIQUE/i)) {
        this.unique = true
      } else if (line.match(/^##/i)) {
        // comment
      } else if (line.match(/^#ALBUM /i)) {
        var album = new spotify.Album(line.substring(7))
        this.entries.add(album)
      } else if (line.match(/^#ARTIST /i)) {
        var artist = new spotify.Artist(line.substring(8))
        this.entries.add(artist)
      } else if (line !== '') {
        var track = new spotify.Track(line)
        this.entries.add(track)
      }
    }
  }
}

/**
 * Dispatch all the entries in the playlist
 * and return the track listing.
 * @return {Queue} A list of results.
 */
spotify.Playlist.prototype.dispatch = function () {
  var self = this
  return this.fetchTracks().then(function () {
    return self.dedup()
  }).then(function () {
    return self.order()
  }).then(function () {
    return self.group()
  }).then(function () {
    return self.toString()
  })
}

/**
 * Dispatch the entries in the playlist.
 */
spotify.Playlist.prototype.fetchTracks = function () {
  var self = this
  return this.entries.dispatch().then(function (result) {
    self.entries = result.flatten()
    return self
  })
}

/**
 * Refresh the entries in the playlist.
 */
spotify.Playlist.prototype.refreshTracks = function () {
  var self = this
  return this.entries.dispatch().then(function (result) {
    self.entries = result.flatten()
    return self
  })
}

/**
 * Fetch Last.fm information.
 */
spotify.Playlist.prototype.fetchLastfm = function () {
  var self = this
  return this.entries.resolveAll(function (entry) {
    return entry.fetchLastfm()
  }).then(function (result) {
    return self
  })
}

/**
 * Remove duplicates.
 */
spotify.Playlist.prototype.dedup = function () {
  if (this.unique) {
    this.entries.dedup()
  }
}

spotify.Playlist.prototype.order = function () {
  var self = this
  if (this.ordering === 'popularity') {
    return this.refreshTracks().then(function () {
      return self.orderByPopularity()
    })
  } else if (this.ordering === 'lastfm') {
    return this.fetchLastfm().then(function () {
      return self.orderByLastfm()
    })
  }
}

spotify.Playlist.prototype.orderByPopularity = function () {
  this.entries.sort(function (a, b) {
    var x = a.popularity()
    var y = b.popularity()
    var val = (x < y) ? 1 : ((x > y) ? -1 : 0)
    return val
  })
}

spotify.Playlist.prototype.orderByLastfm = function () {
  this.entries.sort(function (a, b) {
    var x = a.lastfm()
    var y = b.lastfm()
    var val = (x < y) ? 1 : ((x > y) ? -1 : 0)
    return val
  })
}

spotify.Playlist.prototype.groupByArtist = function () {
  this.entries.group(function (track) {
    return track.artist().toLowerCase()
  })
}

spotify.Playlist.prototype.groupByAlbum = function () {
  this.entries.group(function (track) {
    return track.album().toLowerCase()
  })
}

spotify.Playlist.prototype.groupByEntry = function () {
  this.entries.group(function (track) {
    return track.entry.toLowerCase()
  })
}

spotify.Playlist.prototype.group = function () {
  if (this.grouping === 'artist') {
    return this.groupByArtist()
  } else if (this.grouping === 'album') {
    return this.refreshTracks()
      .then(this.groupByAlbum)
  } else if (this.grouping === 'entry') {
    return this.groupByEntry()
  }
}

/**
 * Convert the playlist to a string.
 * @return {string} A newline-separated list of Spotify URIs.
 */
spotify.Playlist.prototype.toString = function () {
  var result = ''
  this.entries.forEach(function (track) {
    console.log(track.toString())
    console.log(track.lastfm())
    var uri = track.uri()
    if (uri !== '') {
      result += uri + '\n'
    }
  })
  return result.trim()
}

/**
 * Print the playlist to the console.
 */
spotify.Playlist.prototype.print = function () {
  console.log(this.toString())
}

/**
 * Queue of playlist entries.
 * @constructor
 */
spotify.Queue = function () {
  /**
   * Array of entries.
   */
  this.queue = []
}

/**
 * Add an entry.
 */
spotify.Queue.prototype.add = function (entry) {
  this.queue.push(entry)
}

/**
 * Get an entry.
 */
spotify.Queue.prototype.get = function (idx) {
  return this.queue[idx]
}

/**
 * The number of entries.
 */
spotify.Queue.prototype.size = function () {
  return this.queue.length
}

/**
 * Iterate over the queue.
 */
spotify.Queue.prototype.forEach = function (fn) {
  return this.queue.forEach(fn)
}

/**
 * Map a function over the queue.
 */
spotify.Queue.prototype.map = function (fn) {
  var result = new spotify.Queue()
  this.forEach(function (entry) {
    result.add(fn(entry))
  })
  return result
}

/**
 * Concatenate two queues.
 */
spotify.Queue.prototype.concat = function (queue) {
  var result = new spotify.Queue()
  result.queue = this.queue
  result.queue = result.queue.concat(queue.queue)
  return result
}

/**
 * Sort the queue.
 */
spotify.Queue.prototype.sort = function (fn) {
  this.queue = this.queue.sort(fn)
  return this
}

/**
 * Whether the queue contains an entry.
 */
spotify.Queue.prototype.contains = function (obj) {
  for (var i in this.queue) {
    var entry = this.queue[i]
    if ((entry.equals && entry.equals(obj)) ||
        entry === obj) {
      return true
    }
  }
  return false
}

/**
 * Remove duplicate entries.
 */
spotify.Queue.prototype.dedup = function () {
  var result = new spotify.Queue()
  this.queue.forEach(function (entry) {
    if (!result.contains(entry)) {
      result.add(entry)
    }
  })
  this.queue = result.queue
  return this
}

/**
 * Group entries.
 */
spotify.Queue.prototype.group = function (fn) {
  var map = []
  var result = []
  for (var i in this.queue) {
    var entry = this.queue[i]
    var key = fn(entry)

    if (!map[key]) {
      map[key] = []
    }
    map[key].push(entry)
  }
  for (var k in map) {
    result = result.concat(map[k])
  }
  this.queue = result
  return this
}

/**
 * Transform a nested queue into a flat queue.
 */
spotify.Queue.prototype.flatten = function () {
  var result = []
  for (var i in this.queue) {
    var entry = this.queue[i]
    if (entry instanceof spotify.Queue) {
      entry = entry.flatten()
      result = result.concat(entry.queue)
    } else {
      result.push(entry)
    }
  }
  this.queue = result
  return this
}

/**
 * Dispatch all entries in order.
 * @return {Queue} A list of results.
 */
spotify.Queue.prototype.resolveAll = function (fn) {
  // we could have used Promise.all(), but we choose to roll our
  // own, sequential implementation to avoid overloading the server
  var result = new spotify.Queue()
  var ready = Promise.resolve(null)
  this.queue.forEach(function (entry) {
    ready = ready.then(function () {
      return fn(entry)
    }).then(function (value) {
      result.add(value)
    }, function () { })
  })
  return ready.then(function () {
    return result
  })
}

/**
 * Dispatch all entries in order.
 * @return {Queue} A list of results.
 */
spotify.Queue.prototype.dispatch = function () {
  return this.resolveAll(function (entry) {
    return entry.dispatch()
  })
}

/**
 * Track entry.
 * @constructor
 * @param {string} entry - The track to search for.
 * @param {JSON} [response] - Track response object.
 * Should have the property `popularity`.
 * @param {JSON} [responseSimple] - Simplified track response object.
 */
spotify.Track = function (entry, response) {
  /**
   * Entry string.
   */
  this.entry = entry.trim()

  /**
   * Simplified track object.
   */
  this.responseSimple = null

  /**
   * Full track object.
   */
  this.response = null

  if (this.isFullResponse(response)) {
    this.response = response
  } else {
    this.responseSimple = response
  }
}

/**
 * Track ID.
 */
spotify.Track.prototype.id = function () {
  if (this.response &&
      this.response.id) {
    return this.response.id
  } else if (this.responseSimple &&
             this.responseSimple.id) {
    return this.responseSimple.id
  } else if (this.isURI(this.entry)) {
    return this.entry.substring(14)
  } else if (this.isLink(this.entry)) {
    return this.entry.split('/')[4]
  } else {
    return -1
  }
}

/**
 * Whether a string is a Spotify URI.
 */
spotify.Track.prototype.isURI = function (str) {
  return str.match(/^spotify:track:/i)
}

/**
 * Whether a string is a Spotify link.
 */
spotify.Track.prototype.isLink = function (str) {
  return str.match(/^https?:\/\/open\.spotify\.com\/track\//i)
}

/**
 * Whether a track object is full or simplified.
 * A full object includes information (like popularity)
 * that a simplified object does not.
 */
spotify.Track.prototype.isFullResponse = function (response) {
  return response && response.popularity
}

/**
 * Dispatch entry.
 * @return {Promise | URI} The track info.
 */
spotify.Track.prototype.dispatch = function () {
  if (this.response) {
    return Promise.resolve(this)
  } else if (this.responseSimple) {
    return this.fetchTrack()
  } else if (this.isURI(this.entry)) {
    return this.fetchTrack()
  } else if (this.isLink(this.entry)) {
    return this.fetchTrack()
  } else {
    return this.searchForTrack(this.entry)
  }
}

/**
 * Fetch track.
 * @param {JSON} responseSimple - A simplified track response.
 * @return {Promise | Track} A track with
 * a full track response.
 */
spotify.Track.prototype.fetchTrack = function () {
  var id = this.id()
  var url = 'https://api.spotify.com/v1/tracks/'
  url += encodeURIComponent(id)
  var self = this
  return spotify.request(url).then(function (result) {
    self.response = result
    return self
  })
}

/**
 * Search for track.
 * @param {string} query - The query text.
 * @return {Promise | Track} A track with
 * a simplified track response.
 */
spotify.Track.prototype.searchForTrack = function (query) {
  // https://developer.spotify.com/web-api/search-item/
  var url = 'https://api.spotify.com/v1/search?type=track&q='
  url += encodeURIComponent(query)
  var self = this
  return spotify.request(url).then(function (result) {
    if (result.tracks &&
        result.tracks.items[0] &&
        result.tracks.items[0].uri) {
      self.responseSimple = result.tracks.items[0]
      return self
    }
  })
}

/**
 * Fetch Last.fm information.
 */
spotify.Track.prototype.fetchLastfm = function () {
  var artist = this.artist()
  var title = this.title()
  var self = this
  return lastfm.getInfo(artist, title).then(function (result) {
    self.lastfmResponse = result
    return self
  })
}

/**
 * Last.fm rating.
 * @return {Integer} The playcount, or -1 if not available.
 */
spotify.Track.prototype.lastfm = function () {
  if (this.lastfmResponse) {
    return parseInt(this.lastfmResponse.track.playcount)
  } else {
    return -1
  }
}

/**
 * Spotify URI.
 * @return {string} The Spotify URI
 * (a string on the form `spotify:track:xxxxxxxxxxxxxxxxxxxxxx`),
 * or the empty string if not available.
 */
spotify.Track.prototype.uri = function () {
  if (this.response) {
    return this.response.uri
  } else if (this.responseSimple) {
    return this.responseSimple.uri
  } else {
    return ''
  }
}

/**
 * Spotify popularity.
 * @return {int} The Spotify popularity, or -1 if not available.
 */
spotify.Track.prototype.popularity = function () {
  if (this.response) {
    return this.response.popularity
  } else {
    return -1
  }
}

/**
 * Track main artist.
 * @return {string} The main artist.
 */
spotify.Track.prototype.artist = function () {
  var artists = []
  var response = this.response || this.responseSimple
  if (response &&
      response.artists &&
      response.artists[0] &&
      response.artists[0].name) {
    return response.artists[0].name.trim()
  } else {
    return ''
  }
}

/**
 * Track artists.
 * @return {string} All the track artists, separated by `, `.
 */
spotify.Track.prototype.artists = function () {
  var artists = []
  var response = this.response || this.responseSimple
  if (response &&
      response.artists) {
    artists = this.response.artists.map(function (artist) {
      return artist.name.trim()
    })
  }
  return artists.join(', ')
}

/**
 * Track title.
 * @return {string} The track title.
 */
spotify.Track.prototype.title = function () {
  var response = this.response || this.responseSimple
  if (response &&
      response.name) {
    return response.name
  } else {
    return ''
  }
}

/**
 * Track album.
 * @return {string} The track album,
 * or the empty string if not available.
 */
spotify.Track.prototype.album = function () {
  if (this.response &&
      this.response.album &&
      this.response.album.name) {
    return this.response.album.name
  } else {
    return ''
  }
}

/**
 * Full track name.
 * @return {string} The track name, on the form `Title - Artist`.
 */
spotify.Track.prototype.name = function () {
  var title = this.title()
  if (title !== '') {
    var artist = this.artist()
    if (artist !== '') {
      return title + ' - ' + artist
    } else {
      return title
    }
  } else {
    return ''
  }
}

/**
 * Whether this track is identical to another track.
 */
spotify.Track.prototype.equals = function (track) {
  var str1 = this.toString().toLowerCase()
  var str2 = track.toString().toLowerCase()
  return str1 === str2
}

/**
 * Full track title.
 * @return {string} The track title, on the form `Title - Artist`.
 */
spotify.Track.prototype.toString = function () {
  var name = this.name()
  if (name !== '') {
    return name
  } else {
    return this.entry
  }
}

/**
 * Album entry.
 * @constructor
 * @param {string} entry - The album to search for.
 */
spotify.Album = function (entry, response) {
  /**
   * Entry string.
   */
  this.entry = entry.trim()

  if (this.isSearchResponse(response)) {
    this.searchResponse = response
  } else if (this.isAlbumResponse(response)) {
    this.albumResponse = response
  }
}

/**
 * Album ID.
 */
spotify.Album.prototype.id = function () {
  if (this.albumResponse &&
      this.albumResponse.id) {
    return this.albumResponse.id
  } else if (this.searchResponse &&
             this.searchResponse.albums &&
             this.searchResponse.albums.items &&
             this.searchResponse.albums.items[0] &&
             this.searchResponse.albums.items[0].id) {
    return this.searchResponse.albums.items[0].id
  } else {
    return -1
  }
}

/**
 * Dispatch entry.
 * @return {Promise | Queue} The track list.
 */
spotify.Album.prototype.dispatch = function () {
  var self = this
  if (this.searchResponse) {
    return this.fetchAlbum().then(function (response) {
      return self.createQueue(response)
    })
  } else if (this.albumResponse) {
    return this.fetchAlbum().then(function (response) {
      return this.createQueue(response)
    })
  } else {
    return this.searchForAlbum(this.entry).then(function () {
      return self.fetchAlbum()
    }).then(function (response) {
      return self.createQueue(response)
    })
  }
}

/**
 * Search for album.
 * @param {string} query - The query text.
 * @return {Promise | JSON} A JSON response.
 */
spotify.Album.prototype.searchForAlbum = function (query) {
  // https://developer.spotify.com/web-api/search-item/
  var url = 'https://api.spotify.com/v1/search?type=album&q='
  url += encodeURIComponent(query)
  var self = this
  return spotify.request(url).then(function (response) {
    if (self.isSearchResponse(response)) {
      self.searchResponse = response
      return Promise.resolve(response)
    } else {
      return Promise.reject(response)
    }
  }).then(null, function () {
    console.log('COULD NOT FIND ' + query)
    return Promise.reject(null)
  })
}

spotify.Album.prototype.fetchAlbum = function () {
  var id = this.id()
  var url = 'https://api.spotify.com/v1/albums/'
  url += encodeURIComponent(id)
  var self = this
  return spotify.request(url).then(function (response) {
    if (self.isAlbumResponse(response)) {
      self.albumResponse = response
      return Promise.resolve(response)
    } else {
      return Promise.reject(response)
    }
  })
}

spotify.Album.prototype.createQueue = function (response) {
  var tracks = response.tracks.items
  var queue = new spotify.Queue()
  for (var i in tracks) {
    var entry = new spotify.Track(this.entry, tracks[i])
    queue.add(entry)
  }
  return queue
}

spotify.Album.prototype.isSearchResponse = function (response) {
  return response &&
    response.albums &&
    response.albums.items[0] &&
    response.albums.items[0].id
}

spotify.Album.prototype.isAlbumResponse = function (response) {
  return response &&
    response.id
}

/**
 * Artist entry.
 * @constructor
 * @param {string} entry - The artist to search for.
 */
spotify.Artist = function (entry) {
  /**
   * Entry string.
   */
  this.entry = entry.trim()

  /**
   * Search response.
   */
  this.artistResponse = null
}

/**
 * Artist ID.
 */
spotify.Artist.prototype.id = function () {
  if (this.artistResponse &&
      this.artistResponse.artists &&
      this.artistResponse.artists.items[0] &&
      this.artistResponse.artists.items[0].id) {
    return this.artistResponse.artists.items[0].id
  } else {
    return -1
  }
}

/**
 * Dispatch entry.
 * @return {Promise | URI} The artist info.
 */
spotify.Artist.prototype.dispatch = function () {
  var self = this
  return this.searchForArtist(this.entry).then(function () {
    return self.fetchAlbums()
  }).then(function (response) {
    return self.createQueue(response)
  })
}

/**
 * Search for artist.
 * @param {string} query - The query text.
 * @return {Promise | JSON} A JSON response.
 */
spotify.Artist.prototype.searchForArtist = function (query) {
  // https://developer.spotify.com/web-api/search-item/
  var url = 'https://api.spotify.com/v1/search?type=artist&q='
  url += encodeURIComponent(query)
  var self = this
  return spotify.request(url).then(function (response) {
    if (self.isSearchResponse(response)) {
      self.artistResponse = response
      return Promise.resolve(response)
    } else {
      return Promise.reject(response)
    }
  })
}

spotify.Artist.prototype.fetchAlbums = function () {
  var id = this.id()
  var url = 'https://api.spotify.com/v1/artists/'
  url += encodeURIComponent(id) + '/albums'
  var self = this
  return spotify.request(url).then(function (response) {
    if (response.items) {
      self.albumResponse = response
      return Promise.resolve(response)
    } else {
      return Promise.reject(response)
    }
  })
}

spotify.Artist.prototype.createQueue = function (response) {
  var albums = response.items
  var queue = new spotify.Queue()
  for (var i in albums) {
    var entry = new spotify.Album(this.entry, albums[i])
    queue.add(entry)
  }
  return queue.dispatch()
}

spotify.Artist.prototype.isSearchResponse = function (response) {
  return response &&
    response.artists &&
    response.artists.items[0] &&
    response.artists.items[0].id
}

/**
 * Perform a Spotify request.
 * @param {string} url - The URL to look up.
 */
spotify.request = function (url) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      console.log(url)
      request(url, function (err, response, body) {
        if (err) {
          reject(err)
        } else if (response.statusCode !== 200) {
          reject(response.statusCode)
        } else {
          try {
            body = JSON.parse(body)
          } catch (e) {
            reject(e)
          }
          if (body.error) {
            reject(body)
          } else {
            resolve(body)
          }
        }
      })
    }, 100)
  })
}

function main () {
  var input = process.argv[2] || 'input.txt'
  var output = process.argv[3] || 'output.txt'

  var str = fs.readFileSync(input, 'utf8').toString()
  var playlist = new spotify.Playlist(str)

  playlist.dispatch().then(function (str) {
    fs.writeFile(output, str, function (err) {
      if (err) { return }
      console.log('Wrote to ' + output)
    })
  })
}

if (require.main === module) {
  main()
}

module.exports = spotify

/*
  Food for thought ...

  Add support for spotify album links
  (e.g., https://open.spotify.com/album/0xnL6goTzcRFKzbrleXfpF)

  Order albums by year (or rating)

  Add support for Exportify CSV

  Implement merging algorithms from last.py
*/
