const dlib = require("./index");

console.log("UUID:", dlib.UUID());

console.log("start:", dlib.startOfDay(Date.now()));
console.log("end:", dlib.endOfDay(Date.now()));
