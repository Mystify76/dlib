'use strict';

let lut    = [];
for (let i = 0; i < 256; i++) { lut[i] = (i < 16 ? '0' : '') + (i).toString(16); }

function dlib() {
}

/**
 * Generate a UUID.
 * @param noDash if true, dashes will not be included.
 * Shamelessly stolen from someone else, but I don't remember who as it was a long time ago.
 * @returns {string}
 */
dlib.UUID = function (noDash = false) {
  let d0 = Math.random() * 0xffffffff | 0;
  let d1 = Math.random() * 0xffffffff | 0;
  let d2 = Math.random() * 0xffffffff | 0;
  let d3 = Math.random() * 0xffffffff | 0;
  return lut[d0 & 0xff] + lut[d0 >> 8 & 0xff] + lut[d0 >> 16 & 0xff] + lut[d0 >> 24 & 0xff] + (noDash ? '' : '-') +
         lut[d1 & 0xff] + lut[d1 >> 8 & 0xff] + (noDash ? '' : '-') + lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & 0xff] + (noDash ? '' : '-') +
         lut[d2 & 0x3f | 0x80] + lut[d2 >> 8 & 0xff] + (noDash ? '' : '-') + lut[d2 >> 16 & 0xff] + lut[d2 >> 24 & 0xff] +
         lut[d3 & 0xff] + lut[d3 >> 8 & 0xff] + lut[d3 >> 16 & 0xff] + lut[d3 >> 24 & 0xff];
};

module.exports = dlib;

