const path    = require('path');
const webpack = require('webpack');

const NODEENV      = process.env.NODEENV || 'development';
const isProduction = NODEENV === 'production';

module.exports = {
  mode: NODEENV,
  entry  : './src/dlib.js',
  output : {
    path    : path.resolve(__dirname, 'dist'),
    filename: 'dlib.js'
  },
  module : {
    // rules: [
    //   {
    //     test   : /\.js$/,
    //     exclude: /node_modules/,
    //     use    : {
    //       loader : 'babel-loader',
    //       options: {
    //         'presets': [["@babel/preset-env", {"targets": {"esmodules": true, "node": "current"}}]]
    //       }
    //     }
    //   }
    // ]
  },
  stats  : {
    colors: true
  }
};;
