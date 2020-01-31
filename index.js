const fs          = require('fs');
const path        = require('path');
const _           = require("lodash");
const Promise     = require("bluebird");
const queryString = require("query-string");
const moment      = require("moment");
const axios       = require("axios");
const iso_3166_2  = require("./iso-3166-2.json");

Promise.config({warnings: {wForgottenReturn: false}, cancellation: true});

let lut = [];
for (let i = 0; i < 256; i++) { lut[i] = (i < 16 ? '0' : '') + (i).toString(16); }

const dlib = {};

/**
 * A function that can be set when the app starts up to allow this module to get certain app variables.
 * All the arguments are functions that will return whatever it is they are trying to get.
 * @param getWindow
 * @param getDocument
 * @param getReact
 * @param getHistory
 */
dlib.initializer = function (getWindow, getDocument, getReact, getHistory) {

  this.getWindow   = getWindow;
  this.getDocument = getDocument;
  this.getReact    = getReact;
  this.getHistory  = getHistory;

};

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

/**
 * Converts a string to a numeric data type taking invalid values into account
 * @param number A number in milliseconds
 * @param int use parseInt if true, parseFloat if false. Default to false.
 * @returns {number}
 */
dlib.toNumber = function (number, int = false) {
  if (int) {
    return !isNaN(number) && !isNaN(parseInt(number)) ? parseInt(number) : undefined;
  } else {
    return !isNaN(number) && !isNaN(parseFloat(number)) ? parseFloat(number) : undefined;
  }
};

/**
 * Extended check to make sure a value is set.
 * @param value The value to check
 * @returns {boolean}
 */
dlib.isSafe = function (value) {
  return !_.isNaN(value) && value !== undefined && value !== null;
};

/**
 * take 2 or more properties from an object and put them together into a string.
 * @param obj The source object
 * @param props Array of the properties to join
 * @param delimiter The character(s) to use as a seperator. Defaults to a space
 * @param trim If true, a trim() will be applied to the final string.
 * @returns {string}
 */
dlib.combinePropsToString = function (obj, props = [], delimiter = " ", trim = true) {
  let value = props.map(path => _.get(obj, path, "")).join(delimiter);
  if (trim) value = value.trim();
  return value;
};

/**
 * Attempts to remove all html tags from a string.
 * this function requires the document be set in the initializer
 * @param html The value to check
 * @returns {string}
 */
dlib.stripTags = function (html) {
  if (!this.getDocument()) throw new Error("No document defined");
  let div       = this.getDocument().createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
};

/**
 * Converts a non-editable rectangle object (like that returned from getBoundingClientRect) into a plain object.
 * @param rect The value to check
 * @returns {object}
 */
dlib.rectToObject = function (rect) {
  return {
    left  : rect.left,
    right : rect.right,
    top   : rect.top,
    bottom: rect.bottom,
    width : rect.width,
    height: rect.height
  }
};

/**
 * Iterates over object properties and removes any that are functions.
 * @param obj The object to check
 * @returns {object}
 */
dlib.removeFunctions = function (obj) {
  return _.omitBy(obj, (value, key) => {
    if (_.isObject(value)) return this.removeFunctions(value);
    return typeof value === "function";
  });
};

/**
 * Same as array.find except it looks for the last object instead of the first
 * @param array The array to check
 * @param iterator the function iterator to use.
 * @returns {object}
 */
dlib.findLast = function (array, iterator) {
  return array.slice().reverse().find((obj, index) => iterator(obj, (array.length - 1) - index));
};

/**
 * Same as array.findIndex except it looks for the last index instead of the first and returns the array length if not found.
 * @param array The array to check
 * @param iterator the function iterator to use.
 * @returns {number}
 */
dlib.findLastIndex = function (array, iterator) {
  return (array.length - 1) - array.slice().reverse().findIndex(iterator);
};

/**
 * Deeply iterates over an object properties and builds an array of dot paths from all properties.
 * @param source the source object
 * @param circularReferences INTERNAL ONLY - tracks object references to prevent circular reference problems. You should not use this value.
 * @returns {number}
 */
dlib.objectToDotPaths = function (source, circularReferences = []) {
  let keys = [];
  if (circularReferences.some(obj => obj === source)) return keys;
  circularReferences.push(source);

  _.keys(source).forEach((key, index, arr) => {
    if (_.isObjectLike(source[key]) && !_.isDate(source[key])) {
      let subKeys = this.objectToDotPaths(source[key], circularReferences);
      keys        = keys.concat(subKeys.map(subKey => key + "." + subKey));
    } else {
      keys.push(key);
    }
  });
  return keys;
};

/**
 * Asynchronously deeply iterates over an object properties and builds an array of dot paths from all properties.
 * @param source the source object
 * @param circularReferences INTERNAL ONLY - tracks object references to prevent circular reference problems. You should not use this value.
 * @returns {number}
 */
dlib.objectToDotPathsAsync = function (source, circularReferences = []) {
  return new Promise((resolve, reject) => {
    let keys = [];
    if (circularReferences.some(obj => obj === source)) return resolve(keys);
    circularReferences.push(source);

    let promises = [];
    _.keys(source).forEach((key, index, arr) => {
      if (_.isObjectLike(source[key]) && !_.isDate(source[key])) {
        promises.push(this.objectToDotPaths(source[key], circularReferences));
      } else {
        keys.push(key);
      }
    });

    if (promises.length === 0) return resolve(keys);

    Promise.all.then(promises => {
      promises.forEach(subKeys => {
        if (_.keys(source[key]).length === _.keys(subKeys).length) {
          keys.push(key);
        } else {
          keys = keys.concat(subKeys.map(subKey => key + "." + subKey));
        }
      });
      resolve(keys);
    }).catch(err => {
      reject(err);
    });

  });
};

/**
 * Looks into an array of arugments for an element with a specific property and returns that argument.
 * @param args the array of arguments
 * @param prop the property to look for
 * @returns {object}
 */
dlib.getArgWithProp = function (args, prop) {
  let response = undefined;
  _.transform(args, (result, value, key, obj) => _.has(value, prop) ? !(response = value[prop]) : true);
  return response;
};

/**
 * Removes a React Synthetic event from an array and returns an object of the remaining arguments and the event.
 * @param arr the array to check.
 * @returns {{arguments: Array, event: undefined}}
 */
dlib.splitEvent = function (arr) {
  let response = {
    arguments: _.clone(arr),
    event    : undefined
  };

  if (_.isArray(response.arguments)) {
    for (let i = 0; i < response.arguments.length; i++) {
      if (_.isObjectLike(response.arguments[i]) && _.get(response.arguments[i], "constructor.name") === 'SyntheticEvent') {
        response.event = response.arguments[i];
        response.arguments.splice(i, 1);
        return response;
      }
    }
  }
  return response;
};

/**
 * Normalize a string by lower casing it, deburring it, and removing invalid characters
 * @param str the string to normalize
 * @param removeSpaces option to allow space characters or not.
 * @returns {string}
 */
dlib.normalize = function (str, removeSpaces = false) {
  let re = new RegExp("((?!(\\w|\\.|@|_|-|!| )).)*", "g");
  str    = _.deburr(_.toLower(_.trim(str))).replace(re, "");
  if (removeSpaces) str = str.replace(/ /g, "");
  return str;
};

/**
 * Get the browser user agent information
 * This function requires the window object we set in the initializer
 * @returns {object}
 */
dlib.userAgent = function () {
  this.os         = typeof navigator === "object" ? (navigator.platform.match(/mac|win|linux/i) || ["other"])[0].toLowerCase() : "";
  this.ua         = typeof navigator === "object" ? navigator.userAgent : "";
  this.OS         = {
    LINUX  : "LINUX",
    MAC    : "MAC",
    WINDOWS: "WINDOWS"
  };
  this.getOS      = () => {
    if (this.isMac) {
      return this.OS.MAC;
    } else if (this.isLinux) {
      return this.OS.LINUX;
    } else {
      return this.OS.WINDOWS;
    }
  };
  this.isIOS      = /iPad|iPhone|iPod/.test(this.ua) && !this.getWindow().MSStream;
  this.isWin      = (this.os === "win");
  this.isMac      = (this.os === "mac") || this.isIOS;
  this.isLinux    = (this.os === "linux");
  this.isIE       = typeof navigator === "object" ? ((navigator.appName === "Microsoft Internet Explorer" || navigator.appName.indexOf("MSAppHost") >= 0) ? parseFloat((this.ua.match(/(?:MSIE |Trident\/[0-9]+[.0-9]+;.*rv:)([0-9]+[.0-9]+)/) || [])[1]) : parseFloat((this.ua.match(/(?:Trident\/[0-9]+[.0-9]+;.*rv:)([0-9]+[.0-9]+)/) || [])[1])) : false;
  this.isOldIE    = this.isIE && this.isIE < 9;
  this.isGecko    = this.isMozilla = this.ua.match(/ Gecko\/\d+/);
  this.isOpera    = this.getWindow().opera && Object.prototype.toString.call(this.getWindow().opera) === "[object Opera]";
  this.isWebKit   = parseFloat(this.ua.split("WebKit/")[1]) || undefined;
  this.isChrome   = parseFloat(this.ua.split(" Chrome/")[1]) || undefined;
  this.isEdge     = parseFloat(this.ua.split(" Edge/")[1]) || undefined;
  this.isAIR      = this.ua.indexOf("AdobeAIR") >= 0;
  this.isIPad     = this.ua.indexOf("iPad") >= 0;
  this.isAndroid  = this.ua.indexOf("Android") >= 0;
  this.isChromeOS = this.ua.indexOf(" CrOS ") >= 0;
  this.isMobile   = this.isIPad || this.isAndroid;
  return this;
};

/**
 * Simple shortcut function to combine both compact and concat together.
 * @param arrays - the arrays to concat.
 * @return {Array} - the compacted and concatenated array
 */
dlib.concatSm = function (...arrays) {
  return _.compact(_.concat(...arrays));
};

/**
 * Simple shortcut function to truncate a string to a certain length
 * @param string - the string to check
 * @param length - the maximum length of the string
 * @param trailer - if truncated, this will be appended to the end of the string.
 * @return {Array} - the compacted and concatenated array
 */
dlib.truncate = function (string, length, trailer = "") {
  return _.truncate(string, {length: length, omission: trailer});
};

/**
 * Goes through an object and removes any nil properties
 * @return {Array} - the compacted and concatenated array
 * @param object
 */
dlib.removeEmptyProperties = function (object) {
  let keys = _.keys(object);
  keys.forEach(key => {
    if (_.isObjectLike(object[key])) this.removeEmptyProperties(object[key]);
    if (_.isEmpty(object[key]) && !_.isNumber(object[key]) && !_.isBoolean(object[key])) delete object[key];
  });
  return object;
};

/**
 * Iterates over object properties and removes any that are nil.
 * @param obj The object to check
 * @param removeUndefined
 * @param removeNull
 * @param removeEmpty
 * @param removeZero
 * @param removeFalse
 * @param removeOthers
 * @returns {object}
 */
dlib.removeNilProperties = function (obj, removeUndefined = true, removeNull = true, removeEmpty = false, removeZero = false, removeFalse = false, removeOthers = undefined) {
  let options = {removeUndefined, removeNull, removeEmpty, removeZero, removeFalse, removeOthers};
  return removeNilPropertiesWorker(obj, options);
};
const removeNilPropertiesWorker  = function (obj, options) {
  return _.omitBy(obj, removeNilPropertiesOmitter.bind(this, options));
};
const removeNilPropertiesOmitter = function (options, value, key) {
  let result = false;
  if (_.isObject(value)) value = removeNilPropertiesWorker(value, options);
  result = (options.removeNull && _.isNull(value)) || (options.removeUndefined && _.isUndefined(value)) || (options.removeEmpty && _.isEmpty(value)) || (options.removeZero && value === 0) || (options.removeFalse && value === false) || (_.isArray(options.removeOthers) && options.removeOthers.some(remove => value === remove));
  return result;
};

/**
 * Loops through all children of a component and makes sure they all have unique keys
 * This function requires that getReact be set by the initializer
 * @param component
 * @return component
 */
dlib.addKeys = function (component) {
  let react = this.getReact();
  if (!react) throw new Error("No React defined");
  if (!react || !component) return component;
  const isValidElement = react.isValidElement;
  const cloneElement   = react.cloneElement;
  if (!isValidElement(component)) return component;
  if (!_.has(component, ["props", "children"])) return component;

  let children = react.Children.map(component.props.children, (child, index) => {
    if (!isValidElement(child) && !_.has(child, ["props", "children"])) return child;
    return cloneElement(child, {key: index});
  });

  return cloneElement(component, undefined, children);
};

/**
 * randomizes an array
 * @return array
 * @param array
 */
dlib.randomizeArray = function (array) {
  array        = _.clone(array);
  let newArray = [];
  while (array.length > 0) {
    newArray.push(array.splice(this.random(0, array.length - 1), 1));
  }
  return newArray;
};

/**
 * formats a number into currency using toLocaleString
 * @param amount
 * @param currency
 * @param locale
 * @param showCurrency
 * @return {string}
 */
dlib.formatCurrency = function (amount, currency, locale, showCurrency = true) {
  amount   = amount || 0;
  currency = currency || "USD";
  locale   = locale || "en-CA";
  let str  = Number(amount).toLocaleString(locale, {style: 'currency', currency: currency, currencyDisplay: "symbol"}).replace(/^[A-Z]+/, "");
  if (showCurrency) str = `${str} ${_.toUpper(currency)}`;
  return str;
};

/**
 * "escape" alternative for javascript regex strings.
 * @param string
 * @return {*}
 */
dlib.escapeRegEx = function (string) {
  return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};

/**
 * Unformats a currency that was formatted by Intl.NumberFormat
 * @param formattedValue
 * @param currency
 * @param locale
 * @return {number}
 */
dlib.unformatCurrency = function (formattedValue, currency, locale) {
  let cf          = new Intl.NumberFormat(locale, {style: 'currency', currency: currency, currencyDisplay: "code"});
  let options     = cf.resolvedOptions();
  let parts       = cf.formatToParts(9999.99);
  let valCurrency = _.get(parts.find(obj => obj.type === "currency"), ["value"]);
  let valGroup    = _.get(parts.find(obj => obj.type === "group"), ["value"]);
  let valDecimal  = _.get(parts.find(obj => obj.type === "decimal"), ["value"]);
  let reCurrency  = valCurrency ? new RegExp(this.escapeRegEx(valCurrency), "g") : undefined;
  let reGroup     = (valGroup && options.useGrouping) ? new RegExp(this.escapeRegEx(valGroup), "g") : undefined;
  let reDecimal   = valDecimal ? new RegExp(this.escapeRegEx(valDecimal), "g") : undefined;
  if (reCurrency) formattedValue = formattedValue.replace(reCurrency, "");
  if (reGroup) formattedValue = formattedValue.replace(reGroup, "");
  if (reDecimal) formattedValue = formattedValue.replace(reDecimal, ".");
  formattedValue = formattedValue.replace(/[^0-9.]/g, "");
  return Number(formattedValue);
};

/**
 * Checks whether or not an email address is valid. Includes domain suffix validation as of 07-29-2019
 * @returns {boolean}
 * @param email
 * @param emptyIsValid
 */
dlib.isEmailValid = function (email, emptyIsValid = false) {
  if (!email) return emptyIsValid;
  let parts = email.split("@");
  if (parts.length !== 2) return false;
  let local  = parts[0];
  let domain = parts[1];

  if (new RegExp(/(^\.)|(\.\.)|[^A-z0-9-._]|(\.$)/g).test(local)) return false;
  if (new RegExp(/(^\.)|(\.\.)|[^A-z0-9-._]|(\.$)/g).test(domain)) return false;
  let domainSuffixes = ["com", "net", "org", "aaa", "aarp", "abarth", "abb", "abbott", "abbvie", "abc", "able", "abogado", "abudhabi", "ac", "academy", "accenture", "accountant", "accountants", "aco", "actor", "ad", "adac", "ads", "adult", "ae", "aeg", "aero", "aetna", "af", "afamilycompany", "afl", "africa", "ag", "agakhan", "agency", "ai", "aig", "aigo", "airbus", "airforce", "airtel", "akdn", "al", "alfaromeo", "alibaba", "alipay", "allfinanz", "allstate", "ally", "alsace", "alstom", "am", "americanexpress", "americanfamily", "amex", "amfam", "amica", "amsterdam", "analytics", "android", "anquan", "anz", "ao", "aol", "apartments", "app", "apple", "aq", "aquarelle", "ar", "arab", "aramco", "archi", "army", "arpa", "art", "arte", "as", "asda", "asia", "associates", "at", "athleta", "attorney", "au", "auction", "audi", "audible", "audio", "auspost", "author", "auto", "autos", "avianca", "aw", "aws", "ax", "axa", "az", "azure", "ba", "baby", "baidu", "banamex", "bananarepublic", "band", "bank", "bar", "barcelona", "barclaycard", "barclays", "barefoot", "bargains", "baseball", "basketball", "bauhaus", "bayern", "bb", "bbc", "bbt", "bbva", "bcg", "bcn", "bd", "be", "beats", "beauty", "beer", "bentley", "berlin", "best", "bestbuy", "bet", "bf", "bg", "bh", "bharti", "bi", "bible", "bid", "bike", "bing", "bingo", "bio", "biz", "bj", "black", "blackfriday", "blockbuster", "blog", "bloomberg", "blue", "bm", "bms", "bmw", "bn", "bnl", "bnpparibas", "bo", "boats", "boehringer", "bofa", "bom", "bond", "boo", "book", "booking", "bosch", "bostik", "boston", "bot", "boutique", "box", "br", "bradesco", "bridgestone", "broadway", "broker", "brother", "brussels", "bs", "bt", "budapest", "bugatti", "build", "builders", "business", "buy", "buzz", "bv", "bw", "by", "bz", "bzh", "ca", "cab", "cafe", "cal", "call", "calvinklein", "cam", "camera", "camp", "cancerresearch", "canon", "capetown", "capital", "capitalone", "car", "caravan", "cards", "care", "career", "careers", "cars", "cartier", "casa", "case", "caseih", "cash", "casino", "cat", "catering", "catholic", "cba", "cbn", "cbre", "cbs", "cc", "cd", "ceb", "center", "ceo", "cern", "cf", "cfa", "cfd", "cg", "ch", "chanel", "channel", "charity", "chase", "chat", "cheap", "chintai", "christmas", "chrome", "chrysler", "church", "ci", "cipriani", "circle", "cisco", "citadel", "citi", "citic", "city", "cityeats", "ck", "cl", "claims", "cleaning", "click", "clinic", "clinique", "clothing", "cloud", "club", "clubmed", "cm", "cn", "co", "coach", "codes", "coffee", "college", "cologne", "comcast", "commbank", "community", "company", "compare", "computer", "comsec", "condos", "construction", "consulting", "contact", "contractors", "cooking", "cookingchannel", "cool", "coop", "corsica", "country", "coupon", "coupons", "courses", "cr", "credit", "creditcard", "creditunion", "cricket", "crown", "crs", "cruise", "cruises", "csc", "cu", "cuisinella", "cv", "cw", "cx", "cy", "cymru", "cyou", "cz", "dabur", "dad", "dance", "data", "date", "dating", "datsun", "day", "dclk", "dds", "de", "deal", "dealer", "deals", "degree", "delivery", "dell", "deloitte", "delta", "democrat", "dental", "dentist", "desi", "design", "dev", "dhl", "diamonds", "diet", "digital", "direct", "directory", "discount", "discover", "dish", "diy", "dj", "dk", "dm", "dnp", "do", "docs", "doctor", "dodge", "dog", "domains", "dot", "download", "drive", "dtv", "dubai", "duck", "dunlop", "duns", "dupont", "durban", "dvag", "dvr", "dz", "earth", "eat", "ec", "eco", "edeka", "edu", "education", "ee", "eg", "email", "emerck", "energy", "engineer", "engineering", "enterprises", "epson", "equipment", "er", "ericsson", "erni", "es", "esq", "estate", "esurance", "et", "etisalat", "eu", "eurovision", "eus", "events", "everbank", "exchange", "expert", "exposed", "express", "extraspace", "fage", "fail", "fairwinds", "faith", "family", "fan", "fans", "farm", "farmers", "fashion", "fast", "fedex", "feedback", "ferrari", "ferrero", "fi", "fiat", "fidelity", "fido", "film", "final", "finance", "financial", "fire", "firestone", "firmdale", "fish", "fishing", "fit", "fitness", "fj", "fk", "flickr", "flights", "flir", "florist", "flowers", "fly", "fm", "fo", "foo", "food", "foodnetwork", "football", "ford", "forex", "forsale", "forum", "foundation", "fox", "fr", "free", "fresenius", "frl", "frogans", "frontdoor", "frontier", "ftr", "fujitsu", "fujixerox", "fun", "fund", "furniture", "futbol", "fyi", "ga", "gal", "gallery", "gallo", "gallup", "game", "games", "gap", "garden", "gb", "gbiz", "gd", "gdn", "ge", "gea", "gent", "genting", "george", "gf", "gg", "ggee", "gh", "gi", "gift", "gifts", "gives", "giving", "gl", "glade", "glass", "gle", "global", "globo", "gm", "gmail", "gmbh", "gmo", "gmx", "gn", "godaddy", "gold", "goldpoint", "golf", "goo", "goodyear", "goog", "google", "gop", "got", "gov", "gp", "gq", "gr", "grainger", "graphics", "gratis", "green", "gripe", "grocery", "group", "gs", "gt", "gu", "guardian", "gucci", "guge", "guide", "guitars", "guru", "gw", "gy", "hair", "hamburg", "hangout", "haus", "hbo", "hdfc", "hdfcbank", "health", "healthcare", "help", "helsinki", "here", "hermes", "hgtv", "hiphop", "hisamitsu", "hitachi", "hiv", "hk", "hkt", "hm", "hn", "hockey", "holdings", "holiday", "homedepot", "homegoods", "homes", "homesense", "honda", "horse", "hospital", "host", "hosting", "hot", "hoteles", "hotels", "hotmail", "house", "how", "hr", "hsbc", "ht", "hu", "hughes", "hyatt", "hyundai", "ibm", "icbc", "ice", "icu", "id", "ie", "ieee", "ifm", "ikano", "il", "im", "imamat", "imdb", "immo", "immobilien", "in", "inc", "industries", "infiniti", "info", "ing", "ink", "institute", "insurance", "insure", "int", "intel", "international", "intuit", "investments", "io", "ipiranga", "iq", "ir", "irish", "is", "iselect", "ismaili", "ist", "istanbul", "it", "itau", "itv", "iveco", "jaguar", "java", "jcb", "jcp", "je", "jeep", "jetzt", "jewelry", "jio", "jll", "jm", "jmp", "jnj", "jo", "jobs", "joburg", "jot", "joy", "jp", "jpmorgan", "jprs", "juegos", "juniper", "kaufen", "kddi", "ke", "kerryhotels", "kerrylogistics", "kerryproperties", "kfh", "kg", "kh", "ki", "kia", "kim", "kinder", "kindle", "kitchen", "kiwi", "km", "kn", "koeln", "komatsu", "kosher", "kp", "kpmg", "kpn", "kr", "krd", "kred", "kuokgroup", "kw", "ky", "kyoto", "kz", "la", "lacaixa", "ladbrokes", "lamborghini", "lamer", "lancaster", "lancia", "lancome", "land", "landrover", "lanxess", "lasalle", "lat", "latino", "latrobe", "law", "lawyer", "lb", "lc", "lds", "lease", "leclerc", "lefrak", "legal", "lego", "lexus", "lgbt", "li", "liaison", "lidl", "life", "lifeinsurance", "lifestyle", "lighting", "like", "lilly", "limited", "limo", "lincoln", "linde", "link", "lipsy", "live", "living", "lixil", "lk", "llc", "loan", "loans", "locker", "locus", "loft", "lol", "london", "lotte", "lotto", "love", "lpl", "lplfinancial", "lr", "ls", "lt", "ltd", "ltda", "lu", "lundbeck", "lupin", "luxe", "luxury", "lv", "ly", "ma", "macys", "madrid", "maif", "maison", "makeup", "man", "management", "mango", "map", "market", "marketing", "markets", "marriott", "marshalls", "maserati", "mattel", "mba", "mc", "mckinsey", "md", "me", "med", "media", "meet", "melbourne", "meme", "memorial", "men", "menu", "merckmsd", "metlife", "mg", "mh", "miami", "microsoft", "mil", "mini", "mint", "mit", "mitsubishi", "mk", "ml", "mlb", "mls", "mm", "mma", "mn", "mo", "mobi", "mobile", "mobily", "moda", "moe", "moi", "mom", "monash", "money", "monster", "mopar", "mormon", "mortgage", "moscow", "moto", "motorcycles", "mov", "movie", "movistar", "mp", "mq", "mr", "ms", "msd", "mt", "mtn", "mtr", "mu", "museum", "mutual", "mv", "mw", "mx", "my", "mz", "na", "nab", "nadex", "nagoya", "name", "nationwide", "natura", "navy", "nba", "nc", "ne", "nec", "netbank", "netflix", "network", "neustar", "new", "newholland", "news", "next", "nextdirect", "nexus", "nf", "nfl", "ng", "ngo", "nhk", "ni", "nico", "nike", "nikon", "ninja", "nissan", "nissay", "nl", "no", "nokia", "northwesternmutual", "norton", "now", "nowruz", "nowtv", "np", "nr", "nra", "nrw", "ntt", "nu", "nyc", "nz", "obi", "observer", "off", "office", "okinawa", "olayan", "olayangroup", "oldnavy", "ollo", "om", "omega", "one", "ong", "onl", "online", "onyourside", "ooo", "open", "oracle", "orange", "organic", "origins", "osaka", "otsuka", "ott", "ovh", "pa", "page", "panasonic", "paris", "pars", "partners", "parts", "party", "passagens", "pay", "pccw", "pe", "pet", "pf", "pfizer", "pg", "ph", "pharmacy", "phd", "philips", "phone", "photo", "photography", "photos", "physio", "piaget", "pics", "pictet", "pictures", "pid", "pin", "ping", "pink", "pioneer", "pizza", "pk", "pl", "place", "play", "playstation", "plumbing", "plus", "pm", "pn", "pnc", "pohl", "poker", "politie", "porn", "post", "pr", "pramerica", "praxi", "press", "prime", "pro", "prod", "productions", "prof", "progressive", "promo", "properties", "property", "protection", "pru", "prudential", "ps", "pt", "pub", "pw", "pwc", "py", "qa", "qpon", "quebec", "quest", "qvc", "racing", "radio", "raid", "re", "read", "realestate", "realtor", "realty", "recipes", "red", "redstone", "redumbrella", "rehab", "reise", "reisen", "reit", "reliance", "ren", "rent", "rentals", "repair", "report", "republican", "rest", "restaurant", "review", "reviews", "rexroth", "rich", "richardli", "ricoh", "rightathome", "ril", "rio", "rip", "rmit", "ro", "rocher", "rocks", "rodeo", "rogers", "room", "rs", "rsvp", "ru", "rugby", "ruhr", "run", "rw", "rwe", "ryukyu", "sa", "saarland", "safe", "safety", "sakura", "sale", "salon", "samsclub", "samsung", "sandvik", "sandvikcoromant", "sanofi", "sap", "sarl", "sas", "save", "saxo", "sb", "sbi", "sbs", "sc", "sca", "scb", "schaeffler", "schmidt", "scholarships", "school", "schule", "schwarz", "science", "scjohnson", "scor", "scot", "sd", "se", "search", "seat", "secure", "security", "seek", "select", "sener", "services", "ses", "seven", "sew", "sex", "sexy", "sfr", "sg", "sh", "shangrila", "sharp", "shaw", "shell", "shia", "shiksha", "shoes", "shop", "shopping", "shouji", "show", "showtime", "shriram", "si", "silk", "sina", "singles", "site", "sj", "sk", "ski", "skin", "sky", "skype", "sl", "sling", "sm", "smart", "smile", "sn", "sncf", "so", "soccer", "social", "softbank", "software", "sohu", "solar", "solutions", "song", "sony", "soy", "space", "sport", "spot", "spreadbetting", "sr", "srl", "srt", "ss", "st", "stada", "staples", "star", "starhub", "statebank", "statefarm", "stc", "stcgroup", "stockholm", "storage", "store", "stream", "studio", "study", "style", "su", "sucks", "supplies", "supply", "support", "surf", "surgery", "suzuki", "sv", "swatch", "swiftcover", "swiss", "sx", "sy", "sydney", "symantec", "systems", "sz", "tab", "taipei", "talk", "taobao", "target", "tatamotors", "tatar", "tattoo", "tax", "taxi", "tc", "tci", "td", "tdk", "team", "tech", "technology", "tel", "telefonica", "temasek", "tennis", "teva", "tf", "tg", "th", "thd", "theater", "theatre", "tiaa", "tickets", "tienda", "tiffany", "tips", "tires", "tirol", "tj", "tjmaxx", "tjx", "tk", "tkmaxx", "tl", "tm", "tmall", "tn", "to", "today", "tokyo", "tools", "top", "toray", "toshiba", "total", "tours", "town", "toyota", "toys", "tr", "trade", "trading", "training", "travel", "travelchannel", "travelers", "travelersinsurance", "trust", "trv", "tt", "tube", "tui", "tunes", "tushu", "tv", "tvs", "tw", "tz", "ua", "ubank", "ubs", "uconnect", "ug", "uk", "unicom", "university", "uno", "uol", "ups", "us", "uy", "uz", "va", "vacations", "vana", "vanguard", "vc", "ve", "vegas", "ventures", "verisign", "versicherung", "vet", "vg", "vi", "viajes", "video", "vig", "viking", "villas", "vin", "vip", "virgin", "visa", "vision", "vistaprint", "viva", "vivo", "vlaanderen", "vn", "vodka", "volkswagen", "volvo", "vote", "voting", "voto", "voyage", "vu", "vuelos", "wales", "walmart", "walter", "wang", "wanggou", "warman", "watch", "watches", "weather", "weatherchannel", "webcam", "weber", "website", "wed", "wedding", "weibo", "weir", "wf", "whoswho", "wien", "wiki", "williamhill", "win", "windows", "wine", "winners", "wme", "wolterskluwer", "woodside", "work", "works", "world", "wow", "ws", "wtc", "wtf", "xbox", "xerox", "xfinity", "xihuan", "xin", "xn--11b4c3d", "xn--1ck2e1b", "xn--1qqw23a", "xn--2scrj9c", "xn--30rr7y", "xn--3bst00m", "xn--3ds443g", "xn--3e0b707e", "xn--3hcrj9c", "xn--3oq18vl8pn36a", "xn--3pxu8k", "xn--42c2d9a", "xn--45br5cyl", "xn--45brj9c", "xn--45q11c", "xn--4gbrim", "xn--54b7fta0cc", "xn--55qw42g", "xn--55qx5d", "xn--5su34j936bgsg", "xn--5tzm5g", "xn--6frz82g", "xn--6qq986b3xl", "xn--80adxhks", "xn--80ao21a", "xn--80aqecdr1a", "xn--80asehdb", "xn--80aswg", "xn--8y0a063a", "xn--90a3ac", "xn--90ae", "xn--90ais", "xn--9dbq2a", "xn--9et52u", "xn--9krt00a", "xn--b4w605ferd", "xn--bck1b9a5dre4c", "xn--c1avg", "xn--c2br7g", "xn--cck2b3b", "xn--cg4bki", "xn--clchc0ea0b2g2a9gcd", "xn--czr694b", "xn--czrs0t", "xn--czru2d", "xn--d1acj3b", "xn--d1alf", "xn--e1a4c", "xn--eckvdtc9d", "xn--efvy88h", "xn--estv75g", "xn--fct429k", "xn--fhbei", "xn--fiq228c5hs", "xn--fiq64b", "xn--fiqs8s", "xn--fiqz9s", "xn--fjq720a", "xn--flw351e", "xn--fpcrj9c3d", "xn--fzc2c9e2c", "xn--fzys8d69uvgm", "xn--g2xx48c", "xn--gckr3f0f", "xn--gecrj9c", "xn--gk3at1e", "xn--h2breg3eve", "xn--h2brj9c", "xn--h2brj9c8c", "xn--hxt814e", "xn--i1b6b1a6a2e", "xn--imr513n", "xn--io0a7i", "xn--j1aef", "xn--j1amh", "xn--j6w193g", "xn--jlq61u9w7b", "xn--jvr189m", "xn--kcrx77d1x4a", "xn--kprw13d", "xn--kpry57d", "xn--kpu716f", "xn--kput3i", "xn--l1acc", "xn--lgbbat1ad8j", "xn--mgb9awbf", "xn--mgba3a3ejt", "xn--mgba3a4f16a", "xn--mgba7c0bbn0a", "xn--mgbaakc7dvf", "xn--mgbaam7a8h", "xn--mgbab2bd", "xn--mgbah1a3hjkrd", "xn--mgbai9azgqp6j", "xn--mgbayh7gpa", "xn--mgbb9fbpob", "xn--mgbbh1a", "xn--mgbbh1a71e", "xn--mgbc0a9azcg", "xn--mgbca7dzdo", "xn--mgberp4a5d4ar", "xn--mgbgu82a", "xn--mgbi4ecexp", "xn--mgbpl2fh", "xn--mgbt3dhd", "xn--mgbtx2b", "xn--mgbx4cd0ab", "xn--mix891f", "xn--mk1bu44c", "xn--mxtq1m", "xn--ngbc5azd", "xn--ngbe9e0a", "xn--ngbrx", "xn--node", "xn--nqv7f", "xn--nqv7fs00ema", "xn--nyqy26a", "xn--o3cw4h", "xn--ogbpf8fl", "xn--otu796d", "xn--p1acf", "xn--p1ai", "xn--pbt977c", "xn--pgbs0dh", "xn--pssy2u", "xn--q9jyb4c", "xn--qcka1pmc", "xn--qxam", "xn--rhqv96g", "xn--rovu88b", "xn--rvc1e0am3e", "xn--s9brj9c", "xn--ses554g", "xn--t60b56a", "xn--tckwe", "xn--tiq49xqyj", "xn--unup4y", "xn--vermgensberater-ctb", "xn--vermgensberatung-pwb", "xn--vhquv", "xn--vuq861b", "xn--w4r85el8fhu5dnra", "xn--w4rs40l", "xn--wgbh1c", "xn--wgbl6a", "xn--xhq521b", "xn--xkc2al3hye2a", "xn--xkc2dl3a5ee0h", "xn--y9a3aq", "xn--yfro4i67o", "xn--ygbi2ammx", "xn--zfr164b", "xxx", "xyz", "yachts", "yahoo", "yamaxun", "yandex", "ye", "yodobashi", "yoga", "yokohama", "you", "youtube", "yt", "yun", "za", "zappos", "zara", "zero", "zip", "zm", "zone", "zuerich", "zw"];
  return domainSuffixes.some(suffix => domain.endsWith("." + suffix));

};

/**
 * Set's a value into a nested document field. This is because according to the mongoose docs it's not recommend to use
 * lodash set or other library. Don't know why. Just have to do it the hard way.
 * This function will mutate the object.
 * @returns {object}
 */
dlib.setDocumentValue = function (object, path, value) {
  if (!object || !path) return object;
  if (!_.isArray(path)) path = _.split(path, ".");

  let currentObject = object;
  for (let index = 0; index < path.length; index++) {
    if (index === path.length - 1) {
      currentObject[path[index]] = value;
    } else if (_.has(currentObject, path[index])) {
      currentObject = currentObject[path[index]];
    } else if (index < path.length - 1) {
      currentObject[path[index]] = {};
      currentObject              = currentObject[path[index]];
    }
  }

  return object;
};

/**
 * Generate a random password
 * @returns {string}
 */
dlib.generatePassword = function (lowerCase = false, upperCase = true, numbers = true, symbols = false, minLength = 8, maxLength = 8, allowDuplicates = true, preventRepeatingCharacters = true, excludeConfusing = true) {
  let availableCharacters = "";
  if (lowerCase) availableCharacters += "abcdefghijklmnopqrstuvwxyz";
  if (upperCase) availableCharacters += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (numbers) availableCharacters += "012345789";
  if (symbols) availableCharacters += "!@#$%&*";
  if (excludeConfusing) availableCharacters = availableCharacters.replace(/[0OoiIlL1]/g, "");
  availableCharacters = availableCharacters.split(""); // just makes processing easier.

  let length       = minLength === maxLength ? maxLength : this.random(minLength, maxLength);
  let char         = undefined;
  let addAfterPick = undefined;
  let password     = "";

  while (password.length < length || availableCharacters.length < 1) {
    if (availableCharacters.length > 0) {
      let index = this.random(0, availableCharacters.length - 1); // get a this.random letter index;
      char      = availableCharacters.splice(index, 1, "")[0]; // get that letter and remove it from the array.
      if (!_.isNil(addAfterPick)) { // if we are to put the letter back in the array after picking one to prevent repeats, do it now
        availableCharacters.push(addAfterPick);
        addAfterPick = undefined;
      }
      password += char; // add the letter to our password
      if (allowDuplicates) {
        if (preventRepeatingCharacters) addAfterPick = char; // if we are preventing repeating characters, remember it for the next loop and do not re-add it.
        else availableCharacters.push(char); // if we are allow duplicates, just throw it back into the array.
      }
    }
  }
  return password;
};

/**
 * Get's a parameter from a request object that is either in the query property or the body property
 * @param req - the request object
 * @param prop - optional - if specified, it will return the value of the specific query/body property instead of the full object.
 * @param defaultValue
 * @returns {(number|string|object|boolean)}
 */
dlib.getReqProp = function (req, prop = undefined, defaultValue = undefined) {
  if (!req) return undefined;

  let values = undefined;

  if ((req.method === "POST" || req.method === "PUT" && req.body)) values = req.body;
  else if (req.method === "GET" && req.query) values = req.query;
  else if (req.body && !req.query) values = req.body;
  else if (req.query && !req.body) values = req.query;
  else if (req.body && !_.isEmpty(req.body)) values = req.body;
  else if (req.query && !_.isEmpty(req.query)) values = req.body;

  return _.get(values, [prop], defaultValue);
};

/**
 * takes 2 or more objects with string properties and merges all the properties into single strings.
 * @param classes - one or more objects
 * @returns {object} - a new object of all the properties of each object merged together.
 * **/
dlib.mergeClasses = function (...classes) {
  classes = _.compact(classes);
  classes = classes.filter(cls => _.isObjectLike(cls));
  if (classes.length === 0) return {};
  let keys          = _.union(_.flatten(classes.map(cls => _.keys(cls))));
  let mergedClasses = {};
  for (let key of keys) {
    mergedClasses[key] = _.compact(classes.map(cls => cls[key])).join(" ").trim();
  }
  return mergedClasses;
};

/**
 * Takes a mongodb document object and converts it to a standard object. This function accepts an array of documents and will also convert any nested document objects aswell.
 * @param obj - array of documents or a document object.
 * @param removeDoubleUnderscoreProperties - if true, any properties that begin with __ will be removed.
 * @return {object}
 */
dlib.convertToObject = function (obj, removeDoubleUnderscoreProperties = true) {
  if (_.isNil(obj)) return obj;

  function processObject(obj) {
    if (_.isObjectLike(obj)) {
      if (_.isArray(obj)) {
        _.transform(obj, transformCB, obj);
      } else if (obj instanceof Object && (obj instanceof Date === false && obj instanceof RegExp === false && obj instanceof Array === false && obj instanceof Function === false)) {
        if (obj.toObject && typeof obj.toObject === "function") {
          obj = obj.toObject();
          obj = _.omitBy(obj, (obj, key) => key.startsWith("__") || _.isFunction(obj));
          _.transform(obj, transformCB, obj);
        }
      }
    }
    return obj;
  }

  function transformCB(accumulator, value, key, object) {
    value            = processObject(value);
    accumulator[key] = value;
    return accumulator;
  }

  obj = processObject(obj);
  return obj;
};

/**
 * Function for parsing a string and returning all the words in the string as an array AND keeping strings inside of quotes together.
 * @param string - the string to split.
 * @param normalize - normalize the final array elements automatically
 * @return object
 */
dlib.getSearchTerms = function (string, normalize = true) {
  let results = (string || "").match(/".*?"|[\w.']+/g) || [];
  results     = _.uniq(_.compact(results));
  return normalize ? results.map(obj => this.normalize(obj)) : results;
};

/**
 * This function mutates the object. Checks a aggregate query array and looks for invalid fields and removes them.
 * This function currently checks for
 * - undefined sort
 * - undefined skip
 * - undefined or 0 limit
 * - undefined $project
 * @param query
 */
dlib.cleanUpAggregateQuery = function (query) {
  const checkChildren = child => {
    if (_.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        if (checkChildren(child[i])) {
          child.splice(i--, 1);
        }
      }
      return false;
    } else if (_.isObjectLike(child) && !_.isDate(child) && !_.isRegExp(child)) {
      let keys = _.keys(child);
      keys.forEach(key => {
        if (checkChildren(child[key])) {
          delete child[key]
        } else {
          if (key === "$sort") {
            if (_.isNil(child[key]) || child[key] === "") delete child[key];
            return _.keys(child).length === 0;
          } else if (key === "$project") {
            if (_.isNil(child[key]) || _.keys(child[key]).length === 0) delete child[key];
            return _.keys(child).length === 0;
          } else if (key === "$skip") {
            if (_.isNil(child[key]) || (_.isNumber(child[key]) && child[key] < 0)) delete child[key];
            return _.keys(child).length === 0;
          } else if (key === "$limit") {
            if (_.isNil(child[key]) || (_.isNumber(child[key]) && child[key] < 1)) delete child[key];
            return _.keys(child).length === 0;
          }
        }
        return false;
      });
    }
  };

  checkChildren(query);
  return query;
};

/**
 * Shortcut function to simply take the raw results from an aggregate query that has a count and facet and put it into a simpiler object.
 * @param results - the query results
 * @return object
 */
dlib.parseAggregateResults = function (results) {
  return {
    count  : _.get(results, [0, "count", 0, "count"], 0),
    records: _.get(results, [0, "records"], [])
  }
};

/**
 * Takes an aggregated query array and searches for a skip condition in the pipeline and changes it to the specified value.
 * NOTE: This method mutates the array as well as returns it.
 * @param aggregateArray - the query array to alter
 * @param skip - the new value, starting at 0
 * @return array
 */
dlib.setAggregateSkip = function (aggregateArray, skip) {

  const checkPipeline = operator => {
    if (_.isArray(operator)) {
      for (let element of operator) {
        checkPipeline(element);
      }
    } else if (_.isObjectLike(operator)) {
      for (let key of _.keys(operator)) {
        if (key === "$skip") {
          operator[key] = skip;
        } else {
          checkPipeline(operator[key]);
        }
      }
    }
  };
  checkPipeline(aggregateArray);

  return aggregateArray;
};

/**
 * Removes a React Synthetic event from an array and returns an object of the remaining arguments and the event.
 * @param arr the array to check.
 * @returns {{arguments: Array, event: undefined}}
 */
dlib.splitEvent = function (arr) {
  let response = {
    arguments: _.clone(arr),
    event    : undefined
  };

  if (_.isArray(response.arguments)) {
    for (let i = 0; i < response.arguments.length; i++) {
      if (_.isObjectLike(response.arguments[i]) && _.get(response.arguments[i], "constructor.name") === 'SyntheticEvent') {
        response.event = response.arguments[i];
        response.arguments.splice(i, 1);
        return response;
      }
    }
  }
  return response;
};

// --------- Date and Time Functions ------------------------------------------------------------------------

/**
 * Takes a moment.js date token and return it's type as a full name string
 * @param token the moment.js token
 * @returns {string}
 */
dlib.getDateFormatTokenType = function (token) {
  switch (token) {
    case "M":
    case "Mo":
    case "MM":
    case "MMM":
    case "MMMM":
      return "Month";
    case "Q":
    case "Qo":
      return "Quarter";
    case "D":
    case "Do":
    case "DD":
      return "Day";
    case "DDD":
    case "DDDo":
    case "DDDD":
      return "DayOfYear";
    case "d":
    case "do":
    case "dd":
    case "ddd":
    case "dddd":
    case "e":
    case "E":
      return "DayOfWeek";
    case "w":
    case "wo":
    case "ww":
    case "W":
    case "Wo":
    case "WW":
      return "WeekOfYear";
    case "YY":
    case "YYYY":
    case "Y":
      return "Year";
    case "gg":
    case "gggg":
    case "GG":
    case "GGGG":
      return "WeekYear";
    case "A":
    case "a":
      return "Meridiem";
    case "H":
    case "HH":
    case "h":
    case "hh":
    case "k":
    case "kk":
      return "Hour";
    case "m":
    case "mm":
      return "Minute";
    case "s":
    case "ss":
      return "Second";
    case "S":
    case "SS":
    case "SSS":
      return "Millisecond";
    case "Z":
    case "ZZ":
      return "Timezone";
    case "X":
    case "x":
      return "Timestamp";
    default:
      return undefined;
  }
};

/**
 * Takes a moment.js date token and return it's type as a token unit
 * @param token the moment.js token
 * @returns {string}
 */
dlib.getDateFormatTokenUnit = function (token) {
  switch (token) {
    case "M":
    case "Mo":
    case "MM":
    case "MMM":
    case "MMMM":
      return "M";
    case "Q":
    case "Qo":
      return "Q";
    case "D":
    case "Do":
    case "DD":
      return "D";
    case "DDD":
    case "DDDo":
    case "DDDD":
      return "DDD";
    case "d":
    case "do":
    case "dd":
    case "ddd":
    case "dddd":
    case "e":
    case "E":
      return "d";
    case "w":
    case "wo":
    case "ww":
    case "W":
    case "Wo":
    case "WW":
      return "w";
    case "YY":
    case "YYYY":
    case "Y":
      return "Y";
    case "gg":
    case "gggg":
    case "GG":
    case "GGGG":
      return "gg";
    case "A":
    case "a":
      return "a";
    case "H":
    case "HH":
    case "h":
    case "hh":
    case "k":
    case "kk":
      return "h";
    case "m":
    case "mm":
      return "m";
    case "s":
    case "ss":
      return "s";
    case "S":
    case "SS":
    case "SSS":
      return "S";
    case "Z":
    case "ZZ":
      return "Z";
    case "X":
    case "x":
      return "x";
    default:
      return undefined;
  }
};

/**
 * Takes a moment.js format string and converts it to an array
 * @param format the moment.js format string
 * @returns {string}
 */
dlib.dateFormatToArray = function (format) {
  let tokens = ["M", "Mo", "MM", "MMM", "MMMM", "Q", "Qo", "D", "Do", "DD", "DDD", "DDDo", "DDDD", "d", "do", "dd", "ddd", "dddd", "e", "E", "w", "wo", "ww", "W", "Wo", "WW", "YY", "YYYY", "Y", "gg", "gggg", "GG", "GGGG", "A", "a", "H", "HH", "h", "hh", "k", "kk", "m", "mm", "s", "ss", "S", "SS", "SSS", "Z", "ZZ", "X", "x"];
  // because I am too lazy to sort the array manually.
  tokens.sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    return a.localeCompare(b);
  });

  let formatArray = [];
  while (format.length > 0) {
    let tokenFound = false;
    if (format.charAt(0) === "[") {
      let closeIndex = format.indexOf("]");
      if (closeIndex > 0) {
        formatArray.push({separator: format.substr(1, closeIndex - 1)});
        format = format.slice(closeIndex + 1);
      }
    }
    if (format.length > 0) {
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] === format.substr(0, tokens[i].length)) {
          tokenFound = true;
          formatArray.push({token: tokens[i]});
          format = format.slice(tokens[i].length);
          break;
        }
      }
      if (!tokenFound) {
        if (formatArray.length && _.last(formatArray).separator) {
          formatArray[formatArray.length - 1].separator += format.substr(0, 1);
        } else {
          formatArray.push({separator: format.substr(0, 1)});
        }
        format = format.slice(1);
      }
    }
  }

  return formatArray;
};

/**
 * Takes a moment.js format string and converts it to an text mask array, mainly used with material-io date picker controls.
 * see https://github.com/text-mask/text-mask/blob/master/componentDocumentation.md#readme for more information
 * @param format the moment.js format string
 * @returns {string}
 */
dlib.dateFormatToMask = function (format) {
  if (!format) return undefined;

  let mask = this.dateFormatToArray(format);
  mask     = mask.map(element => {
    if (_.has(element, "token")) {
      switch (element.token) {
        case "d":
        case "e":
        case "E":
          return /\d/;
        case "M":
        case "MM":
        case "Q":
        case "D":
        case "DD":
        case "w":
        case "ww":
        case "W":
        case "WW":
        case "YY":
        case "gg":
        case "H":
        case "HH":
        case "h":
        case "hh":
        case "k":
        case "kk":
        case "m":
        case "mm":
        case "s":
        case "ss":
        case "S":
        case "SS":
          return [/\d/, /\d/];
        case "DDD":
        case "DDDD":
        case "SSS":
          return [/\d/, /\d/, /\d/];
        case "YYYY":
        case "gggg":
        case "SSSS":
          return [/\d/, /\d/, /\d/, /\d/];
        case "X":
        case "x":
          return /\d+/;
        case "Mo":
        case "Qo":
        case "Do":
        case "DDDo":
        case "do":
        case "wo":
        case "Wo":
          return [/\d/, /\d/, /[A-z]/, /[A-z]/];
        case "MMM":
        case "ddd":
          return /[A-z]/, /[A-z]/, /[A-z]/;
        case "MMMM":
        case "dddd":
        case "Z":
        case "z":
          return /\w/;
        case "dd":
          return /[A-z]/, /[A-z]/;
        case "A":
          return /AM|PM/;
        case "a":
          return /am|pm/;
        default:
          return _.toString(token);
      }
    } else if (_.has(element, "separator")) {
      return _.toString(element.separator);
    } else {
      return _.toString(element);
    }
  });

  mask = _.flatten(mask);
  return mask;
};
dlib.showTimeUnit         = {
  always : "always",
  nonZero: "nonZero",
  never  : "never"
};
dlib.toTimeStringDefaults = {showDays: "nonZero", showHours: "nonZero", showMinutes: "nonZero", showSeconds: "nonZero", showMilliseconds: "never", padDays: false, padHours: false, padMinutes: false, padSeconds: false, formatNumber: true};

/**
 * Convert a number in milliseconds to a time formatted string in dd:hh:m:ss.ms
 * @param number A number in milliseconds that you want to convert to a time string.
 * @param options show or hide time units.
 * @returns {string}
 */
dlib.toTimeString = function (number, options = {}) {
  let result, d, h, m, s, x;
  if (_.isNil(number) || _.isNaN(number) || !_.isFinite(number)) return undefined;
  _.defaults(options, this.toTimeStringDefaults);

  let isNegative = number < 0;
  if (isNegative) number = Math.abs(number);

  d = Math.floor(number / (1000 * 60 * 60 * 24));
  if (options.showDays === this.showTimeUnit.always || (options.showDays.nonZero && d > 0)) {
    h = Math.floor((number / (1000 * 60 * 60)) % 24);
    m = Math.floor((number / (1000 * 60)) % 60);
    s = Math.floor((number / 1000) % 60);
    x = Math.floor(number % 1000);

    d      = options.formatNumber ? d.toLocaleString() : _.toString(d);
    result = options.padDays ? _.padStart(d, 2, "0") : d;
    if (options.showHours !== this.showTimeUnit.never) {
      result += ":" + _.padStart(h, 2, "0");
      if (options.showMinutes !== this.showTimeUnit.never) {
        result += ":" + _.padStart(m, 2, "0");
        if (options.showSeconds !== this.showTimeUnit.never) {
          result += ":" + _.padStart(s, 2, "0");
          if (options.showMilliseconds !== this.showTimeUnit.never) {
            result += "." + _.padStart(x, 3, "0");
          }
        }
      }
    }
  } else {
    h = Math.floor(number / (1000 * 60 * 60));
    if (options.showHours === this.showTimeUnit.always || (options.showHours === this.showTimeUnit.nonZero && h > 0)) {
      h      = options.formatNumber ? h.toLocaleString() : _.toString(h);
      result = options.padhours ? _.padStart(h, 2, "0") : h;
      m      = Math.floor((number / (1000 * 60)) % 60);
      s      = Math.floor((number / 1000) % 60);
      x      = Math.floor(number % 1000);
      if (options.showMinutes !== this.showTimeUnit.never) {
        result += ":" + _.padStart(m, 2, "0");
        if (options.showSeconds !== this.showTimeUnit.never) {
          result += ":" + _.padStart(s, 2, "0");
          if (options.showMilliseconds !== this.showTimeUnit.never) {
            result += "." + _.padStart(x, 3, "0");
          }

        }
      }
    } else {
      m = Math.floor(number / (1000 * 60));
      if (options.showMinutes === this.showTimeUnit.always || (options.showMinutes === this.showTimeUnit.nonZero && m > 0)) {
        m      = options.formatNumber ? m.toLocaleString() : _.toString(m);
        result = options.padMinutes ? _.padStart(m, 2, "0") : m;
        s      = Math.floor((number / 1000) % 60);
        x      = Math.floor(number % 1000);
        if (options.showSeconds !== this.showTimeUnit.never) {
          result += ":" + _.padStart(s, 2, "0");
          if (options.showMilliseconds !== this.showTimeUnit.never) {
            result += "." + _.padStart(x, 3, "0");
          }
        }
      } else {
        s = Math.floor(number / 1000);
        if (options.showSeconds === this.showTimeUnit.always || (options.showSeconds === this.showTimeUnit.nonZero && s > 0)) {
          s      = options.formatNumber ? s.toLocaleString() : _.toString(s);
          result = options.padSeconds ? _.padStart(s, 2, "0") : s;
          x      = Math.floor(number % 1000);
          if (options.showMilliseconds !== this.showTimeUnit.never) {
            result += "." + _.padStart(x, 3, "0");
          }
        } else {
          x = number;
          if (options.showMilliseconds === this.showTimeUnit.always || (options.showMilliseconds === this.showTimeUnit.nonZero && x > 0)) {
            result = "0." + _.padStart(x, 3, "0");
          } else {
            result = "0";
          }
        }
      }
    }
  }

  return (isNegative ? "-" : "") + result;
};

/**
 * takes a datetime in milliseconds and returns the start of day in milliseconds
 * @param number A number in milliseconds
 * @param utc - the milliseconds is in utc time
 * @returns {number}
 */
dlib.startOfDay = function (number, utc = false) {
  if (utc) return moment().utc(number).startOf("day").valueOf();
  return moment(number).startOf("day").valueOf();
};

/**
 * takes a datetime in milliseconds and returns the end of day in milliseconds
 * @param number A number in milliseconds
 * @param utc - the milliseconds is in utc time
 * @returns {number}
 */
dlib.endOfDay = function (number, utc = false) {
  if (utc) return moment().utc(number).endOf("day").valueOf();
  return moment(number).endOf("day").valueOf();
};

/**
 * Takes an object that has year, month, day, hour, minute, second properties and returns a formatted date string.
 * @returns {number}
 * @param object
 */
dlib.objectToDate = function (object) {
  return new Date(object.year, object.month - 1, object.day, object.hour || object.hours || 0, object.minute || object.minutes || 0, object.second || object.seconds || 0);
};

// ---------- Debugging --------------------------------------------------------------------------------

/**
 * compare two objects and return an obj containing the differences.
 * @param objectToCompareFrom first object to check
 * @param objectToCompareTo second object to check
 * @returns {object}
 */
dlib.differenceObj = function (objectToCompareFrom, objectToCompareTo) {
  function changes(object, base) {
    return _.transform(object, function (result, value, key) {
      if (!_.isEqual(value, base[key])) {
        result[key] = (_.isObject(value) && _.isObject(base[key])) ? changes(value, base[key]) : value;
      }
    });
  }

  let diff1 = changes(objectToCompareFrom, objectToCompareTo);
  let diff2 = changes(objectToCompareTo, objectToCompareFrom);
  return _.merge({}, diff1, diff2);
};

/**
 * Compares two objects as if they were children props. Functions, _ properties, and $$ propertes are omitted.
 * @param object the first object to compare
 * @param other the second object to compare
 * @returns {boolean}
 */
dlib.areChildrenEqual = function (object, other) {
  return _.isEqualWith(object, other, (object, other, key) => {
    if (_.isFunction(object) && _.isFunction(other)) return true;
    if (_.isString(key) && key.startsWith("_")) return true;
    if (_.isString(key) && key.startsWith("$$")) return true;
  })
};

// ---------- Math helpers ------------------------------------------------------------------------------------

/**
 * Calculates the value between 2 numbers based on percentage
 * @param percentage percentage value between 0 and 1
 * @param maxValue the higher value number to use.
 * @param minValue the lower value number to use
 * @param ascending if true, the starting value will be 0, if false, the starting value will be 1.
 * @returns {number}
 */
dlib.percent = function (percentage, maxValue = 1, minValue = 0, ascending = true) {
  return ((maxValue - minValue) * Math.max(0, Math.min(1, Math.abs(Number(ascending) - percentage)))) + minValue;
};

/**
 * Calculates the value between 2 numbers based on percentage given as a fraction.
 * @param numerator the numerator value to calculate the percentage
 * @param denominator the denominator value to calculate the percentage
 * @param maxValue the higher value number to use.
 * @param minValue the lower value number to use
 * @param ascending if true, the starting value will be 0, if false, the starting value will be 1.
 * @returns {number}
 */
dlib.percentf = function (numerator, denominator, maxValue = 1, minValue = 0, ascending = true) {
  return ((maxValue - minValue) * Math.max(0, Math.min(1, Math.abs(Number(!ascending) - (numerator / denominator))))) + minValue;
};

/**
 * converts a value to base 16 and makes sure it's at least 2 characters.
 * @param value the value to convert
 * @returns {string}
 */
dlib.toHex = function (value) {
  let hex = value.toString(16);
  return hex.length === 1 ? "0" + hex : hex;
};

/**
 * Generates a random number between 2 integers.
 * @param min the lower number
 * @param max the higher number
 * @returns {number}
 */
dlib.random = function (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Radians to degrees
 * @param rads
 * @returns {number}
 */
dlib.toDegrees = function (rads) {
  return rads * (180 / Math.PI);
};

/**
 * degrees to radians
 * @param degs
 * @returns {number}
 */
dlib.toRadians = function (degs) {
  return degs * (Math.PI / 180);
};

/**
 * gets the distance between 2 sets of x,y coords
 * @param x1
 * @param y1
 * @param x2
 * @param y2
 * @returns {number}
 */
dlib.getDistanceBetweenCoords = function (x1, y1, x2, y2) {
  let dx = x2 - x1;
  let dy = y2 - y1;
  return Math.sqrt((dx * dx) + (dy * dy));
};

/**
 * gets the distance between 2 numbers
 * @param dx
 * @param dy
 * @returns {number}
 */
dlib.getDistanceDelta = function (dx, dy) {
  return Math.sqrt((dx * dx) + (dy * dy));
};

/**
 * get the point on a line between 2 points based on distance from point 1
 * @param x1
 * @param y1
 * @param x2
 * @param y2
 * @param distanceFromX1Y1 distance from x1, y1
 * @returns {number}
 */
dlib.getPointOnLine = function (x1, y1, x2, y2, distanceFromX1Y1) {
  let d = this.getDistanceBetweenCoords(x1, y1, x2, y2);
  if (d === 0) return [x1, y1];

  let per = (distanceFromX1Y1 / d);
  return this.getPointOnLinePercentage(x1, y1, x2, y2, per);
};

/**
 * gets the point on a line between 2 points based on the percentage distance from point 1
 * @param x1
 * @param y1
 * @param x2
 * @param y2
 * @param percentageBetweenFromX1Y1 Percentage distance between 0 and 1 from x1,y1 to x2,y2
 * @returns {number}
 */
dlib.getPointOnLinePercentage = function (x1, y1, x2, y2, percentageBetweenFromX1Y1) {
  let deltaX = (x2 - x1);
  let deltaY = (y2 - y1);
  let x      = x1 + (deltaX * percentageBetweenFromX1Y1);
  let y      = y1 + (deltaY * percentageBetweenFromX1Y1);
  return {x, y};
};

/**
 * get the point on a line between 2 numbers.
 * @param a
 * @param b
 * @param distanceFromPointA distance from a
 * @returns {number}
 */
dlib.getPointOnLine2D = function (a, b, distanceFromPointA) {
  let d   = b - a;
  let per = distanceFromPointA / d;
  return a + (d * per);
};

/**
 * get the point on a line between 2 numbers.
 * @param a
 * @param b
 * @param percentageFromPointA Percentage distance between 0 and 1 from a to b
 * @returns {number}
 */
dlib.getPointOnLine2DPercentage = function (a, b, percentageFromPointA) {
  let d = (b - a);
  return a + (d * percentageFromPointA);
};

/**
 * get's the point on a line based on a bezier curve using steps
 * @param x1
 * @param y1
 * @param x2
 * @param y2
 * @param cx1 x control point for x1,y1
 * @param cy1 y control point for x1,y1
 * @param cx2 x control point from x2,y2
 * @param cy2 y control point from x2,y2
 * @param step the step point on the line based on the total number of steps to take
 * @param steps the total number of steps to take between x1,y1 and x2,y2
 * @returns {number}
 */
dlib.getBezierPoint = function (x1, y1, x2, y2, cx1, cy1, cx2, cy2, step, steps) {
  return this.getBezierPointPercentage(x1, y1, x2, y2, cx1, cy1, cx2, cy2, step / steps);
};

/**
 * get's the point on a line based on a bezier curve using a percentage
 * @param x1
 * @param y1
 * @param x2
 * @param y2
 * @param cx1 x control point for x1,y1
 * @param cy1 y control point for x1,y1
 * @param cx2 x control point from x2,y2
 * @param cy2 y control point from x2,y2
 * @param percentage value from 0 to 1 for distance from x1,y1 to x2,y2
 * @returns {number}
 */
dlib.getBezierPointPercentage = function (x1, y1, x2, y2, cx1, cy1, cx2, cy2, percentage) {
  let x = this.getBezier2DPercentage(x1, x2, cx1, cx2, percentage);
  let y = this.getBezier2DPercentage(y1, y2, cy1, cy2, percentage);
  return {x, y};
};

/**
 * calculates the bezier point on a line between 2 points using steps
 * @param p1 number start value
 * @param p2 number end value
 * @param cp1 control point for p1
 * @param cp2 control point for p2
 * @param step the step point on the line based on the total number of steps to take
 * @param steps the total number of steps to take between p1 and p2
 * @returns {number}
 */
dlib.getBezier2D = function (p1, p2, cp1, cp2, step, steps) {
  return this.getBezier2DPercentage(p1, p2, cp1, cp2, step / steps);
};

/**
 * calculates the bezier point on a line between 2 points using percentage
 * @param p1 number start value
 * @param p2 number end value
 * @param cp1 control point for p1
 * @param cp2 control point for p2
 * @param percentage value from 0 to 1 for distance from p1 to p2
 * @returns {number}
 */
dlib.getBezier2DPercentage = function (p1, p2, cp1, cp2, percentage) {
  let C = 3 * (cp1 - p1);
  let B = 3 * (cp2 - cp1) - C;
  let A = p2 - p1 - C - B;

  let t1 = percentage;
  let t2 = (t1 * t1);
  let t3 = (t2 * t1);

  return (A * t3 + B * t2 + C * t1 + p1);
};

// ---------- Color helpers ----------------------------------------------------------------------------------------

/**
 * takes a hex color value and converts it into an rgba object
 * @param color an rgb() string, rgba() string, or hex color string (# or 0x)
 * @returns {object}
 */
dlib.colorToRGBA = function (color) {
  let newColor = {r: 0, g: 0, b: 0, a: 1};

  try {
    let alpha = null;
    if (color.startsWith("rgb")) {
      color = color.replace(/(rgb\()|(rgba\()|\)/g, "").split(",");
      if (color.length < 3 || color.length > 4) return undefined;
      newColor.r = parseInt(color[0]);
      newColor.g = parseInt(color[1]);
      newColor.b = parseInt(color[2]);
      if (color[3]) newColor.a = color[3] ? parseFloat(color[3]) : 1;

    } else {
      if (color.startsWith("#")) color = color.substr(1, color.length);
      if (color.startsWith("0x")) color = color.substr(2, color.length);
      switch (color.length) {
        case 8:
          alpha = parseInt(color.substr(-2, 2), 16);
          color = parseInt(color.substr(0, 6), 16);
          break;
        case 6:
          color = parseInt(color, 16);
          break;
        case 4:
          alpha = parseInt(color.substr(-1, 1) + color.substr(-1, 1), 16);
          color = parseInt(color[0] + color[0] + color[1] + color[1] + color[2] + color[2], 16); // 1 digit with alpha
          break;
        case 3:
          color = parseInt(color[0] + color[0] + color[1] + color[1] + color[2] + color[2], 16); // 1 digit outout alpha
          break;
        default:
          return undefined;
      }

      newColor.r = color >> 16 & 255;
      newColor.g = color >> 8 & 255;
      newColor.b = color & 255;
      if (alpha !== null) newColor.a = alpha;
    }
  } catch (err) {
    // color was missing or a literal string.
  }
  return newColor;
};

/**
 * converts an rgb value into hex.
 * @param red the red value (0 to 255) or an object containing (r:#, g:#, b:#, a:#) where a is optional
 * @param green the green value (0 to 255) - omit if r is color object
 * @param blue the blue value (0 to 255) - omit if r is color object
 * @param alpha optional - the alpha color between 0 and 255 - omit if r is color object
 * @returns {string}
 */
dlib.rgbaToHex = function (red, green, blue, alpha) {
  let {r, g, b, a} = _.isObjectLike(red) && _.has(red, ["r"]) && _.has(red, ["g"]) && _.has(red, ["b"]) ? red : _.isString(red) ? this.colorToRGBA(red) : {r: red, g: green, b: blue, a: alpha};
  if (_.isNil(r) || _.isNil(g) || _.isNil(b)) return undefined;

  r = r.toString(16).padStart(2, "0");
  g = g.toString(16).padStart(2, "0");
  b = b.toString(16).padStart(2, "0");
  a = _.isNil(a) ? undefined : Math.round(255 * a).toString(16).padStart(2, "0");

  if (!_.isNil(a)) return "#" + r + g + b + a;  // return with alpha
  return "#" + r + g + b;  // return without alpha
};

/**
 * shortcut function to simply take an rgb/rgba object and convert it to the rgba string for css.
 * @param color - the object containing r, g, b, and a properties.
 * @returns {string}
 */
dlib.rgbaToString = function (color) {
  if (!color) color = {};
  if (!color.r) color.r = 0;
  if (!color.g) color.g = 0;
  if (!color.b) color.b = 0;
  return `rgb${_.has(color, "a") ? "a" : ""}(${color.r}, ${color.g}, ${color.b}${_.has(color, "a") ? `, ${color.a}` : ""})`;
};

/**
 * Converts a standard hex color string into it's component RGB values and then combines it together to return an RGBA string.
 * @param hexColor = the hex color as in #000000 or #000
 * @param a - optional alpha channel, if omitted, an RGB string will be returned instead of RGBA
 */
dlib.hexToRGBA = function (hexColor, a) {
  if (!hexColor) return undefined;
  if (hexColor === "transparent") return 0;
  let color = this.colorToRGBA(hexColor);
  if (!_.isNil(a)) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${a})`;
  } else {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  }
};

/**
 * Create a new color that is a shade between 2 colors based on percentage or a shade from the from color to black or white.
 * @param percentage value between 0 and 1
 * @param from string or object - can be a 3 or 6 character hex value ("#000" or "#000000), a string starting with rgb or rgba ("rgb(#, #, #, #)") or an object containing rgba properties ({r:#, g:#, b:#, a:#}) - (alpha values are optional and not changed)
 * @param to the color that the from will be blended towards
 * @returns {string}
 */
dlib.colorBlend = function (percentage, from, to) {
  if (_.isNil(percentage) || _.isNil(from) || _.isNil(to)) return undefined;
  if (typeof (percentage) !== "number") return undefined;
  if (percentage === 0) return from;

  try {
    let fromColor = _.isObjectLike(from) && _.has(from, ["r"]) && _.has(from, ["g"]) && _.has(from, ["b"]) ? from : this.colorToRGBA(from);
    let toColor   = _.isObjectLike(to) && _.has(to, ["r"]) && _.has(to, ["g"]) && _.has(to, ["b"]) ? to : this.colorToRGBA(to);
    percentage    = Math.max(0, Math.min(1, percentage));

    let newColor = {r: 0, g: 0, b: 0, a: 1};
    newColor.r   = Math.round(this.percent(percentage, fromColor.r, toColor.r));
    newColor.g   = Math.round(this.percent(percentage, fromColor.g, toColor.g));
    newColor.b   = Math.round(this.percent(percentage, fromColor.b, toColor.b));
    newColor.a   = Math.round(this.percent(percentage, fromColor.a, toColor.a));

    if (_.isObjectLike(from)) return newColor;
    if (from.startsWith("rgba")) return "rgba(" + newColor.r + "," + newColor.g + "," + newColor.b + "," + newColor.a + ")";
    if (from.startsWith("rgb")) return "rgb(" + newColor.r + "," + newColor.g + "," + newColor.b + ")";
    if (from.startsWith("#")) return this.rgbaToHex(newColor.r, newColor.g, newColor.b, from.length === 5 || from.length === 9 ? newColor.a : undefined);
  } catch (err) {
    // color may have just been a litteral string... or something else. doesn't matter.
  }
  return undefined;
};

/**
 * Get the estimated brightness value of a color
 * @param color string or object - can be a 3 or 6 character hex value ("#000" or "#000000), a string starting with rgb or rgba ("rgb(#, #, #, #)") or an object containing rgba properties ({r:#, g:#, b:#, a:#}) - (alpha values are optional and not changed)
 * @returns {number|undefined}
 */
dlib.getBrightness = function (color) {
  if (_.isNil(color)) return undefined;
  try {
    let {r, g, b} = _.isObjectLike(color) && _.has(color, ["r"]) && _.has(color, ["g"]) && _.has(color, ["b"]) ? color : this.colorToRGBA(color);
    if (_.isNil(r) && _.isNil(g) && _.isNil(b)) return undefined;

    return (r * 299 + g * 587 + b * 114) / 1000;
  } catch (err) {
    return undefined;
  }
};

/**
 * Shortcut function to tell me if a color is considered "dark" or not.
 * @param color string or object - can be a 3 or 6 character hex value ("#000" or "#000000), a string starting with rgb or rgba ("rgb(#, #, #, #)") or an object containing rgba properties ({r:#, g:#, b:#, a:#}) - (alpha values are optional and not changed)
 * @param brightnessOffset
 * @returns {boolean|undefined}
 */
dlib.isDark = function (color, brightnessOffset = 0) {
  return this.getBrightness(color) < 123 + brightnessOffset;
};

// ----------- Image and Dom processing ------------------------------------------------------------------------------------------------

/**
 * Asynchronously resizes an image to a specific size using an html canvas
 * This function requires that the intializer be set for the document object
 * @param imgSource can be raw base64 data:image data OR a url!
 * @param targetWidth in pixels
 * @param targetHeight in pixels
 * @param keepAspectRatio if true, aspect ratio will be maintained based on whatever ratio is higher
 * @returns {string}
 */
dlib.resizeImage = function (imgSource, targetWidth, targetHeight, keepAspectRatio = true) {
  return new Promise((resolve, reject, onCancel) => {
    let cancelled = false;
    onCancel && onCancel(() => cancelled = true);
    if (!this.getDocument()) return reject("document not defined");
    let image     = new Image();
    image.onerror = () => reject();
    image.onload  = (e) => {
      if (cancelled) return;
      let width  = image.width;
      let height = image.height;

      let newWidth  = targetWidth;
      let newHeight = targetHeight;
      if (keepAspectRatio) {
        if (width > height) {
          newHeight = height * (targetWidth / width);
          newWidth  = targetWidth;
        } else {
          newWidth  = width * (targetHeight / height);
          newHeight = targetHeight;
        }
      }
      let canvas       = [this.getDocument().createElement('canvas'), this.getDocument().createElement('canvas')];
      let ctx          = [canvas[0].getContext('2d'), canvas[1].getContext('2d')];
      canvas[0].width  = width;
      canvas[0].height = height;
      ctx[0].drawImage(image, 0, 0, width, height);

      let steps    = 0;
      let lastStep = false;
      let index;
      while (lastStep === false) {
        steps++;

        let currentWidth  = width;
        let currentHeight = height;

        if (image.width > newWidth) {
          width = width * 0.6;
          if (width < newWidth) lastStep = true;
        } else {
          width = width * 2.2;
          if (width > newWidth) lastStep = true;
        }
        if (image.height > newHeight) {
          height = height * 0.6;
          if (height < newHeight) lastStep = true;
        } else {
          height = height * 2.2;
          if (height > newHeight) lastStep = true;
        }

        if (lastStep) {
          width  = newWidth;
          height = newHeight;
        }

        index = steps % 2;

        canvas[index].width  = width;
        canvas[index].height = height;
        ctx[index].drawImage(canvas[Math.abs(index - 1)], 0, 0, currentWidth, currentHeight, 0, 0, width, height);
      }
      resolve(canvas[index].toDataURL('image/png'));
    };
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = imgSource;
  });
};

/**
 * get the bound client rectangle of a dom element but return our own editable rect object
 * @param element
 * @returns {object}
 */
dlib.getBoundingClientRect = (element) => {
  return new this.rect(element.getBoundingClientRect());
};

/**
 * an as close as I can get copy of the rectangle object (usually returned by the getBoundingClientRect) that allowed changes
 */
dlib.rect = class rect {
  constructor(top = 0, right = 0, bottom = 0, left = 0, x = 0, y = 0) {
    this.set(top, right, bottom, left, x, y);
  }

  get left() {
    return this._left;
  }

  set left(value) {
    this._left  = value;
    this._width = this._right - value;
  }

  get right() {
    return this._right;
  }

  set right(value) {
    this._right = value;
    this._width = value - this._left;
  }

  get top() {
    return this._top;
  }

  set top(value) {
    this._top    = value;
    this._height = this._bottom - value;
  }

  get bottom() {
    return this._bottom;
  }

  set bottom(value) {
    this._bottom = value;
    this._height = value - this._top;
  }

  get width() {
    return this._width;
  }

  set width(value) {
    this._width = value;
    this._right = this._left + value;
  }

  get height() {
    return this._height;
  }

  set height(value) {
    this._height = value;
    this._bottom = this._top + value;
  }

  get x() {
    return this._x;
  }

  set x(value) {
    this._left  = value;
    this._right = value + this._width;
    this._x     = value;
  }

  get y() {
    return this._y;
  }

  set y(value) {
    this._top    = value;
    this._bottom = value + this._height;
    this._y      = value;
  }

  fromDomRect(domRect) {
    this.set(domRect.top, domRect.right, domRect.bottom, domRect.left, domRect.x, domRect.y);
  }

  set(top = 0, right = 0, bottom = 0, left = 0, x = 0, y = 0) {
    if (typeof top === "object") {
      if (top.left) left = top.left;
      if (top.right) right = top.right;
      if (top.bottom) bottom = top.bottom;
      if (top.x) x = top.x;
      if (top.y) y = top.y;
      if (top.top) top = top.top;
    }

    this._left   = parseFloat(left, 10);
    this._right  = parseFloat(right, 10);
    this._top    = parseFloat(top, 10);
    this._bottom = parseFloat(bottom, 10);
    this._width  = parseFloat(right) - parseFloat(left, 10);
    this._height = parseFloat(bottom) - parseFloat(top, 10);
    this._x      = parseFloat(x, 10);
    this._y      = parseFloat(y, 10);
  }

  expand(offsetX, offsetY) {
    if (!offsetY) offsetY = offsetX;
    this.set(this.top + offsetY, this.right - offsetX, this.bottom - offsetY, this.left + offsetX)
  }

  clone() {
    return new rect(this.top, this.right, this.bottom, this.left, this.x, this.y);
  }
};

/**
 * Shortcut function to get the size of the browser viewport
 * this function requires the document and window object be initialized
 * @returns {object}
 */
dlib.getViewport = function () {
  if (!this.getDocument()) throw new Error("No document defined");
  let w = Math.max(this.getDocument().documentElement.clientWidth, this.getWindow().innerWidth || 0);
  let h = Math.max(this.getDocument().documentElement.clientHeight, this.getWindow().innerHeight || 0);

  return {width: w, height: h};
};

/**
 * Tries to set focus on the next element in the tab order
 * This function requires the intializer be called to set the document object.
 */
dlib.focusNextElement = function () {
  if (!this.getDocument()) throw new Error("No document defined");
  let currentFocus = this.getDocument().activeElement;
  let elements     = [...this.getDocument().querySelectorAll("a[href]:not([tabindex='-1']), area[href]:not([tabindex='-1']), input:not([disabled]):not([tabindex='-1']), select:not([disabled]):not([tabindex='-1']), textarea:not([disabled]):not([tabindex='-1']), button:not([disabled]):not([tabindex='-1']), iframe:not([tabindex='-1']), [tabindex]:not([tabindex='-1']), [contentEditable=true]:not([tabindex='-1'])")];
  elements.sort((a, b) => parseInt(a.tabIndex || 0) - parseInt(b.tabIndex || 0));
  let currentIndex = elements.findIndex(obj => obj === currentFocus);
  let nextIndex    = currentIndex < elements.length - 1 ? currentIndex + 1 : 0;
  elements[nextIndex].focus();
};

// ----------- File Processing ------------------------------------------------------------------------------------------------

/**
 * takes a number, assuming to be bytes, and reteurns what it's upper base unit would be.
 * @param size number in bytes
 * @returns {string}
 */
dlib.getFileSizeBaseUnit = function (size) {
  if (size < 1000) return "b";
  if (size < 1000000) return "kb";
  if (size < 1000000000) return "mb";
  if (size < 1000000000000) return "gb";
  return "tb";
};

/**
 * Takes an integer (assuming bytes) and converts it to it's short hand version. Similar to windows file manager
 * @param size number in bytes
 * @param unit specifies what the size unit is. defaults to bytes.
 * @param decimals the number of decimal places to return.
 * @param addUnit if true, the unit characters will be appended to the string.
 * @returns {string}
 */
dlib.getFileSizeString = function (size, unit = "b", decimals = 0, addUnit = true) {
  unit = _.toUpper(unit);
  if (unit !== "B" && unit !== "KB" && unit !== "MB" && unit !== "GB" && unit !== "TB") unit = "KB";
  if (_.isNil(size)) size = 0;
  size = parseInt(size);
  if (_.isNaN(size)) size = 0;
  if (decimals < 0) decimals = 0;
  let precision = Math.pow(10, decimals);
  let base      = 1;

  if (unit === "B") base = 0;
  else if (unit === "KB") base = 1;
  else if (unit === "MB") base = 2;
  else if (unit === "GB") base = 3;
  else if (unit === "TB") base = 4;

  // let unitIndex = parseInt(Math.floor(Math.log(size) / Math.log(1024)), 10);
  let newSize = (size / (1024 ** base));
  newSize     = Math.round(newSize * precision) / precision;
  newSize     = newSize === 0 ? "<" + (1 / precision) : Number(newSize).toLocaleString();
  return newSize + (addUnit ? " " + unit : "");
};

/**
 * Generate an array of all the directories in a specified directory
 * @param dir the target directory
 * @returns {array}
 */
dlib.getAllDirectories = function (dir) {
  let returnDirs = [dir];
  if (fs.existsSync(dir)) {
    let files       = fs.readdirSync(dir);
    let directories = files.filter(obj => fs.statSync(dir + path.sep + obj).isDirectory());
    for (let directory of directories) {
      let directoryPath  = dir + path.sep + directory;
      let subDirectories = this.getAllDirectories(directoryPath);
      returnDirs         = returnDirs.concat(subDirectories);
    }
  }
  return _.compact(returnDirs);
};

/**
 * Comparator for a sort function to compare and sort paths.
 * @param sep the path separator.
 * @returns {array}
 */
dlib.pathSorter = function (sep = "/") {
  return function (aValue, bValue) {
    let a = aValue.split(sep);
    let b = bValue.split(sep);
    let l = Math.max(a.length, b.length);
    for (let i = 0; i < l; i++) {
      if (!(i in a)) return -1;
      if (!(i in b)) return +1;
      if (a[i].toUpperCase() > b[i].toUpperCase()) return +1;
      if (a[i].toUpperCase() < b[i].toUpperCase()) return -1;
      if (a.length < b.length) return -1;
      if (a.length > b.length) return +1;
    }
    return 0;
  }
};

dlib.sort = function (arr, locale, path = undefined, caseInsensitive = false, trim = false) {
  let collator = new Intl.Collator(locale || "en-CA", {sensitivity: 'base'});
  arr.sort((valA, valB) => {
    if (path) valA = _.get(valA, [path]);
    if (path) valB = _.get(valB, [path]);

    valA = _.isNil(valA) ? "" : valA;
    valB = _.isNil(valB) ? "" : valB;
    if (!_.isNil(this.toNumber(valA)) && _.isNil(this.toNumber(valB))) return 1;
    if (_.isNil(this.toNumber(valA)) && !_.isNil(this.toNumber(valB))) return -1;
    if (!_.isNil(this.toNumber(valA)) && !_.isNil(this.toNumber(valB))) return (this.toNumber(valA) - this.toNumber(valB));
    if (caseInsensitive === true) {
      valA = _.upperCase(valA);
      valB = _.upperCase(valB);
    }
    if (trim) {
      valA = _.trim(valA);
      valB = _.trim(valB);
    }
    return collator.compare(valA, valB);
  });
  return arr;
};

/**
 * Asynchronously load a file.
 * @param path the path and filename to load.
 * @returns {string}
 */
dlib.loadFileAsync = function (path) {
  return new Promise((resolve, reject) => {
    let xhr                = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        if (xhr.status === 200) {
          resolve(xhr.responseText);
        } else {
          reject(xhr);
        }
      }
    };
    xhr.open("GET", path, true);
    xhr.send();

  });
};

/**
 * To use:
 * const cache = {}; // define object to receive imports
 * dlib.importFiles(cache, require.context(PathToFiles, SearchSubDirs, RegExpFileMask);
 * ie:
 * let teamPhotos = {};
 * dlib.importFiles(teamPhotos, require.context('assets/aboutus/teamPhotos', false, /\.jpg$/));
 *
 * @param cache
 * @param files
 * @param trimTopLevelFolder
 * @param trimExtension
 */
dlib.importFiles = function (cache, files, trimTopLevelFolder = true, trimExtension = true) {
  files.keys().forEach(key => {
    let cacheKey = key;
    if (trimTopLevelFolder) cacheKey = cacheKey.replace(/\.[\\\/]/, '');
    if (trimExtension) cacheKey = cacheKey.replace(/\..*$/, '');
    cache[cacheKey] = files(key).default;
  });
};

// ----------- Document Helpers --------------------------------------------------------------------------------------------------

/**
 * Get's a parameter from a request object that is either in the query property or the body property
 * @param req - the request object
 * @param prop - optional - if specified, it will return the value of the specific query/body property instead of the full object.
 * @param defaultValue
 * @returns {(number|string|object|boolean)}
 */
dlib.getReqProp = function (req, prop = undefined, defaultValue = undefined) {
  if (!req) return undefined;

  let values = undefined;

  if ((req.method === "POST" || req.method === "PUT" && req.body)) values = req.body;
  else if (req.method === "GET" && req.query) values = req.query;
  else if (req.body && !req.query) values = req.body;
  else if (req.query && !req.body) values = req.query;
  else if (req.body && !_.isEmpty(req.body)) values = req.body;
  else if (req.query && !_.isEmpty(req.query)) values = req.body;

  return _.get(values, [prop], defaultValue);
};

/**
 * Copy a bit of text to the clipboard
 * This function requires the document be set in the initializer
 * @param str - the string to put into the clipboard.
 */
dlib.copyToClipboard = function (str) {
  const el = this.getDocument().createElement('textarea');
  el.value = str;
  el.setAttribute('readonly', '');
  el.style.position = 'absolute';
  el.style.left     = '-9999px';
  el.style.zIndex = 9999999999;
  this.getDocument().body.appendChild(el);
  el.focus();
  el.select();
  this.getDocument().execCommand('copy');
  this.getDocument().body.removeChild(el);
};

/**
 * Default options for the openURL function
 * @type {{button: number, specs: undefined, search: undefined, ctrl: boolean, userOpener: boolean, action: string, state: undefined, params: {}, useQueryString: boolean, key: undefined, target: undefined}}
 */
dlib.openURLOptions = {
  search        : undefined,
  action        : "PUSH",
  params        : {},
  key           : undefined,
  state         : undefined,
  ctrl          : false,
  button        : 0,
  useQueryString: true,
  userOpener    : false,
  target        : undefined,
  specs         : undefined //https://www.w3schools.com/jsref/met_win_open.asp
};

/**
 * Open a url either using the history object or the window object. Both need to be set by the initializer for this to work.
 */
dlib.openURL = function (pathname, options = {}) {
  if (!this.getWindow()) throw new Error("No window defined");
  if (!this.getHistory()) throw new Error("No history defined");
  _.defaults(options, this.openURLOptions);

  let queryObject = queryString.stringify(_.merge({}, options.useQueryString && this.getWindow().query, options.params));
  let windowObj   = options.userOpener ? this.getWindow().opener : this.getWindow();
  options.target  = options.target ? options.target : (options.ctrlKey || options.button === 1) ? "_blank" : undefined;

  if (options.target) {
    return windowObj.open(pathname + "?" + queryObject, options.target, options.specs)
  } else {
    let location = {
      pathname: pathname,
      search  : queryObject,
      state   : options.state,
      key     : this.UUID()
    };
    if (options.action === "replace") {
      this.getHistory().replace(location);
    } else {
      this.getHistory().push(location);
    }
  }
};

// ----------- Network Helpers --------------------------------------------------------------------------------------------------

/**
 * Convert's an integer ip number into a x.x.x.x string
 * @param ipNum
 * @returns {string}
 */
dlib.numberToIPv4 = function (ipNum) {
  if (!ipNum) return "0.0.0.0";
  return `${Math.floor((ipNum / 16777216)) % 256}.${Math.floor((ipNum / 65536)) % 256}.${Math.floor((ipNum / 256)) % 256}.${ipNum % 256}`;
};

dlib.getLocationProviders = {
  freeGeoIp      : "freegeoip",
  extremeIpLookup: "extremeiplookup",
  ipGeolocation  : "ipgeolocation",
  KeyCDN         : "keycdn"
};

dlib.getLocationFromIp = function (ip, provider = "freegeoip", extra = false, raw = false) {
  return new Promise((resolve, reject) => {

    let url = "";
    switch (provider) {
      case "extremeiplookup":
        url = `https://extreme-ip-lookup.com/json/${ip}`;
        break;
      case "ipgeolocation":
        url = `https://api.ipgeolocation.io/ipgeo?apiKey=7d9e6199c7c14ce9bc053f54c58f8955&ip=${ip}`;
        break;
      case "keycdn":
        url = `https://tools.keycdn.com/geo.json?host=${ip}`;
        break;
      case "freegeoip":
        url = `https://freegeoip.app/json/${ip}`;
        break;
      default:
        return reject("Unknown provider");
    }

    axios.get(url).then(response => {
      if (response.status === 200) {
        if (raw) return resolve(response);
        let location = response.data;
        let retval = {};
        switch (provider) {
          case "extremeiplookup":
            retval = {
              ip: ip,
              country: location.countryCode,
              subdivision: iso_3166_2[location.countryCode] ? _.findKey(iso_3166_2[location.countryCode].divisions, name => this.normalize(name).includes(this.normalize(location.region))) : "",
              city: location.city,
              zip: ""
            };
            if(extra) {
              retval.subdivision_name = location.region;
              retval.country_name = location.country;
              retval.continent_name = location.continent;
            }
            break;
          case "ipgeolocation":
            retval = {
              ip: location.ip,
              country: location.country_code2,
              subdivision: iso_3166_2[location.country_code2] ? _.findKey(iso_3166_2[location.country_code2].divisions, name => this.normalize(name).includes(this.normalize(location.state_prov))) : "",
              city: location.city,
              zip: location.zipcode
            };
            if(extra) {
              retval.subdivision_name = location.state_prov;
              retval.country_name = location.country_name;
              retval.continent = location.continent_code;
              retval.continent_name = location.continent_name;
            }
            break;
          case "keycdn":
            location = location.data.geo;
            retval = {
              ip: location.ip,
              country: location.country_code,
              subdivision: `${location.country_code}-${location.region_code}`,
              city: location.city,
              zip: location.postal_code
            };
            if(extra) {
              retval.subdivision_name = location.region_name;
              retval.country_name = location.country_name;
              retval.continent = location.continent_code;
              retval.continent_name = location.continent_name;
            }
            break;
          case "freegeoip":
            retval = {
              ip: location.ip,
              country: location.country_code,
              subdivision: `${location.country_code}-${location.region_code}`,
              city: location.city,
              zip: location.zip_code
            };
            if(extra) {
              retval.subdivision_name = location.region_name;
              retval.country_name = location.country_name;
            }
            break;
        }
        resolve(retval);
      }
    }).catch(reject);
  });
};

// ----------- iso_3166_2 Country and Subdivision Helpers --------------------------------------------------------------------------------------------------

/**
 * Make the constants file available to the outside.
 * @type object
 */
dlib.iso_3166_2 = iso_3166_2;

/**
 * Does a check to make sure that a countryShort and subdivisionShort are in the iso_3166_2 file
 * @returns boolean
 * @param countryShort
 * @param subdivisionShort
 */
dlib.checkLocation = function (countryShort, subdivisionShort) {
  if (!_.has(iso_3166_2, countryShort)) return false;
  if (!_.has(iso_3166_2[countryShort].divisions, subdivisionShort)) return false;
};

/**
 * Does a check to make sure that a countryShort is in the iso_3166_2 file
 * @returns boolean
 * @param countryShort
 */
dlib.checkCountry = function (countryShort) {
  return _.has(iso_3166_2, countryShort);
};

/**
 * Does a check to make sure that a subdivisionShort is in the iso_3166_2 file
 * @returns boolean
 * @param subdivisionShort
 */
dlib.checkSubdivision = function (subdivisionShort) {
  return _.has(iso_3166_2, [_.nth(_.split(subdivisionShort, "-"), 0), "divisions", subdivisionShort]);
};

/**
 * returns the long name of hte country and subdivision based on the iso_3166_2 file
 * @returns Object
 * @param countryShort
 * @param subdivisionShort
 */
dlib.getLongLocation = function (countryShort, subdivisionShort) {
  let countryLong     = _.get(iso_3166_2, [countryShort, "name"]);
  let subdivisionLong = _.get(iso_3166_2, [countryShort, "divisions", subdivisionShort]);
  return {countryLong, subdivisionLong};
};

/**
 * Get the long country name from the the iso_3166_2 file
 * @returns string
 * @param countryShort
 */
dlib.getCountryLong = function (countryShort) {
  return _.get(iso_3166_2, [countryShort, "name"]);
};

/**
 * Get the subdivision long name from the iso_3166_2 file
 * @returns string
 * @param subdivisionShort
 */
dlib.getSubdivisionLong = function (subdivisionShort) {
  return _.get(iso_3166_2, [_.nth(_.split(subdivisionShort, "-"), 0), "divisions", subdivisionShort]);
};

/**
 * Get the subdivision compact name from the iso_3166_2 file
 * @returns string
 * @param subdivisionShort
 */
dlib.getSubdivisionCompact = function (subdivisionShort) {
  return _.trim(_.replace(_.get(iso_3166_2, [_.nth(_.split(subdivisionShort, "-"), 0), "divisions", subdivisionShort]),/(,.*)|(\(.*\))|(\[.*])/,""));
};

/**
 * Return an array containing the country list with only the country code and the display name
 * @returns {[]}
 */
dlib.getCountries = function() {
  let countries = [];
  _.map(iso_3166_2, (value, key) => countries.push({code: key, name: value}));
  return countries;
};

/**
 * Return the subdivisions for a specific country
 * @param country
 * @returns {[]}
 */
dlib.getSubdivisions = function(country) {
  let subdivisions = [];
  _.map(_.get(iso_3166_2, [country, "divisions"], {}), (value, key) => subdivisions.push({code: key, name: value}));
  return subdivisions;
};

/**
 * Return the subdivisions for a specific country but with extra name information trimmed out automatically.
 * @param country
 * @returns {[]}
 */
dlib.getSubdivisionsCompact = function(country) {
  let subdivisions = [];
  _.map(_.get(iso_3166_2, [country, "divisions"], {}), (value, key) => subdivisions.push({code: key, name: _.trim(_.replace(value,/(,.*)|(\(.*\))|(\[.*])/,""))}));
  return subdivisions;
};

/**
 * in the iso, some of the subdivision names are really really big because of extra content provided in brackets and the like.
 * This function trims that to the bare minimum. Mainly used for display purposes.
 * @param subdivision
 */
dlib.compactSubdivisionName = function(subdivision) {
  return _.trim(_.replace(subdivision,/(,.*)|(\(.*\))|(\[.*])/,""))
};


module.exports = dlib;
