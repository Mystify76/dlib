// This file will do the following:
//  1. increment the revision version number in package.json
//  2. git add .
//  3. git commit  -- you will be prompted for the commit message in the console
//  4. git push
//  best thing to do is run this script before you npm publish.

const path            = require('path');
const _               = require("lodash");
const simpleGit       = require('simple-git');
const prompt          = require('prompt-promise');
const buildManagement = require('@mystify/buildmanagement');

const APPVERSION = buildManagement.incrementRevisionNumber(path.join(__dirname, "/package.json"));
const git        = simpleGit(path.join(__dirname, ""));

let commit_message;

prompt("commit message: ").then(message => {
  commit_message = message;
  //commit_message = `Publishing version ${buildManagement.buildObjectToVersionString(APPVERSION)`;
  console.log("Attempting to add files...");
  return git.add("./*");
}).then((result) => {
  console.log("Attempting to commit");
  return git.commit(commit_message);
}).then((result) => {
  console.log("Attempting to push");
  return git.push('origin', 'master');
}).then((result) => {
  console.log("Attempting to publish...");
}).catch(err => {
  console.error("There was an error in the git process:");
  console.error(err);
  process.exit(1);
}).finally(() => {
  process.exit(0);
});
