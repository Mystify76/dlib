# dlib
A collection of short cut functions I use in various projects.


### REMEMBER:

in your webpack you need to transpile this project with babel, so you need to do this:

`exclude  : /node_modules(?!([\/\\]@mystify)).*/,
`

examples:

```
const rules = [
  {
    test   : /\.(js|jsx)$/,
    exclude: /node_modules(?!([\/\\]@mystify)).*/,
  }, {
    test   : /[\/\\]+fonts[\/\\]+[\w\-\\\/]*[\w\-]+\.(ttf|eot|svg|woff|woff2?)$/i,
    exclude: /node_modules/,
  }, {
    test   : /\.css$/,
    exclude: /node_modules(?!([\/\\]@mystify)).*/,
  }, {
    test   : /\.less$/,
    exclude: /node_modules(?!([\/\\]@mystify)).*/,
  }
];

const plugins = [
  new HappyPack({
    loaders: [
      {
        loader   : 'babel-loader',
        'test'   : /\.(js|jsx)$/,
        exclude  : /node_modules(?!([\/\\]@mystify)).*/,
      }
    ],
  })
]
```
