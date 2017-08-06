#!/usr/bin/env node
/* global document:true, window:true */

var eol = require('eol')
var fs = require('fs')
var jsdom = require('jsdom').jsdom
document = jsdom()
window = document.defaultView
var prompt = require('cli-input')
var Generator = require('./lib/generator')

var help = 'Usage:\n' +
    '\n' +
    '    spotgen input.txt output.txt\n' +
    '\n' +
    'input.txt is a text file containing a generator string,\n' +
    'invoking any number of generator commands. output.txt\n' +
    'will contain the generator\'s output, a list of Spotify URIs\n' +
    'which can be imported into Spotify.\n' +
    '\n' +
    'Alternatively, you can pass a generator string as a single argument.\n' +
    'In that case, the Spotify URIs are written to standard output:\n' +
    '\n' +
    '    spotgen "#artist Bowery Electric"\n' +
    '    spotgen "#similar Beach House\\n#similar Hooverphonic"\n' +
    '    spotgen http://www.last.fm/user/username/library\n' +
    '\n' +
    'Make sure to surround the string with quotes (") if it contains\n' +
    'spaces or special characters. Line breaks can be expressed as \\n.\n' +
    '\n' +
    'You can also run the generator with no arguments and enter commands\n' +
    'interactively. This saves you the trouble of quoting strings and\n' +
    'escaping newlines.\n' +
    '\n' +
    'To import the playlist into Spotify:\n' +
    '\n' +
    '1.  Copy the output of the generator:\n' +
    '    Choose Edit -> Copy (Ctrl + C).\n' +
    '2.  Create a new playlist in Spotify:\n' +
    '    Choose File -> New Playlist (Ctrl + N).\n' +
    '3.  Paste into the playlist:\n' +
    '    Select the playlist and choose Edit -> Paste (Ctrl + V).'

/**
 * Generator function.
 * @param {string} str - Generator string.
 * @param {output} [output] - Output file.
 * @return {Promise} A promise.
 */
function generate (str, output) {
  output = output || 'STDOUT'
  output = output.trim()
  var generator = new Generator(str)
  return generator.generate().then(function (result) {
    if (!result) {
      return
    }
    if (output === 'STDOUT') {
      console.log('')
      if (generator.format === 'uri') {
        console.log(
          '********************************************************\n' +
            '* COPY AND PASTE THE BELOW INTO A NEW SPOTIFY PLAYLIST *\n' +
            '********************************************************\n')
      }
      console.log(result + '\n')
    } else {
      result = eol.auto(result)
      fs.writeFile(output, result, function (err) {
        if (err) { return }
        console.log('Wrote to ' + output)
      })
    }
  })
}

/**
 * Main method.
 * Invoked when run from the command line.
 */
function main () {
  var input = process.argv[2]
  var output = process.argv[3]
  var str = input
  if (typeof input === 'string' &&
      input.match(/(^-*h(elp)?$)|(^\/\?$)/gi)) {
    console.log(help)
    return
  }
  if (!input) {
    console.log('Enter generator string (submit with Ctrl-D):')
    var ps = prompt()
    ps.multiline(function (err, lines, str) {
      if (err) {
        return
      }
      if (str !== '' && str.slice(-1) !== '\n') {
        console.log('')
      }
      generate(str).then(function () {
        process.exit(0)
      })
    })
  } else {
    if (!output) {
      // help out primitive shells (e.g., Windows') with newlines
      str = str.replace(/\\n/gi, '\n')
      generate(str)
    } else {
      str = fs.readFileSync(input, 'utf8').toString()
      str = eol.lf(str)
      generate(str, output)
    }
  }
}

if (require.main === module) {
  main()
}

module.exports = Generator
