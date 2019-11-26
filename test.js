const source = require("./src/dlib.js");
const dist = require("./dist/dlib.js");

console.log("source UUID:", source.UUID());
console.log("dist UUID:", dist.UUID());
