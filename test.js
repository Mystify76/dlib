const dlib = require("./index");

console.log("UUID:", dlib.UUID());

let d = new Date("2019 12 01 22:00:00").getTime()

console.log("date:", d, new Date(d  - (new Date().getTimezoneOffset() * 1000 * 60)));
console.log("start:", dlib.startOfDay(d), new Date(dlib.startOfDay(d  - (new Date().getTimezoneOffset() * 1000 * 60))));
console.log("end:", dlib.endOfDay(d), new Date(dlib.endOfDay(d  - (new Date().getTimezoneOffset() * 1000 * 60))));
