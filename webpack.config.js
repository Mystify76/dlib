const path    = require('path');
const webpack = require('webpack');

const NODEENV      = process.env.NODEENV || 'development';
const isProduction = NODEENV === 'production';

module.exports = {
  mode: NODEENV,
  entry  : './src/index.js',
  output : {
    path    : path.resolve(__dirname, 'dist'),
    filename: 'dlib.js'
  },
  module : {
    rules: [
      {
        test   : /\.js$/,
        exclude: /node_modules/,
        use    : {
          loader : 'babel-loader',
          options: {
            'plugins': [
              "lodash",
              "@babel/plugin-syntax-dynamic-import",
              "@babel/plugin-transform-runtime",
              ["@babel/plugin-proposal-decorators", {"legacy": true}],
              ["@babel/plugin-proposal-class-properties", {"loose": true}],
              ["@babel/plugin-syntax-decorators", {"legacy": true}],
              "@babel/plugin-proposal-object-rest-spread"
            ],
            'presets': [["@babel/preset-env", {"targets": {"esmodules": false, "node": "current"}}]]
          }
        }
      }
    ]
  },
  stats  : {
    colors: true
  }
};;
