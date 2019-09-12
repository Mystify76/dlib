const _                    = require("lodash");
const webpack              = require('webpack');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const TerserJSPlugin       = require('terser-webpack-plugin');

const NODEENV  = process.env.NODEENV || 'development';
const BUILDING = process.env.BUILDING || false;

const isProduction = NODEENV === 'production';
const jsSourcePath = path.join(__dirname, 'src');
const buildPath    = path.join(__dirname, './build');
const sourcePath   = path.join(__dirname, './');
let outputFile     = "";

const optimization = {
  minimizer: [new TerserJSPlugin({})]
};

// Common plugins
const plugins = [
  new webpack.DefinePlugin({'NODEENV': JSON.stringify(NODEENV)}),
  new CleanWebpackPlugin()
];

// Common rules
const rules = [{
  test   : /\.(js|jsx)$/,
  exclude: /node_modules/,
  use    : [{
    loader   : 'babel-loader',
    'test'   : /\.(js|jsx)$/,
    'exclude': /node_modules/,
    'options': {
      'plugins': [
        "lodash",
        "@babel/plugin-syntax-dynamic-import",
        "@babel/plugin-transform-runtime",
        ["@babel/plugin-proposal-decorators", {"legacy": true}],
        ["@babel/plugin-proposal-class-properties", {"loose": true}],
        ["@babel/plugin-syntax-decorators", {"legacy": true}],
        "@babel/plugin-proposal-object-rest-spread"
      ],
      'presets': [["@babel/preset-env", {"targets": {"esmodules": true, "node": "current"}, "useBuiltIns": "usage", "corejs": 3}]]
    }
  }]
}];

if (isProduction) {
  // Production plugins
  outputFile = 'dlib.min.js';
}
else {
  // Development plugins
  outputFile = 'dlib.js';
}

module.exports = {
  mode   : isProduction ? "production" : "development",
  devtool: isProduction ? "" : 'eval-source-map',
  context: jsSourcePath,
  entry  : {
    js: 'index.js'
  },
  output : {
    path      : buildPath,
    publicPath: '/',
    filename  : 'dlib.js'
  },
  module   : {
    rules
  },
  resolve  : {
    extensions: ['.webpack-loader.js', '.web-loader.js', '.loader.js', '.js', '.jsx'],
    alias     : {},
    modules   : [
      './node_modules',
      jsSourcePath
    ]
  },
  plugins,
  optimization
};
