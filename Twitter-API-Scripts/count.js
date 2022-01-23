require("dotenv").config();

const fs = require("fs");

const axios = require("axios");

const rateLimit = 100;
const secLimit = 1000;
let rateWindow = Math.floor(new Date().getTime() / 1000) + 900;
let remainingRate = rateLimit;
let secNow = Math.floor(new Date().getTime() / 1000);

// set constants //
// the start date and time of the search
const startTime = process.env.startTime;
// the end date and time of the search
const endTime = process.env.endTime;
// filepath to write count info to
const countsFilePath = process.env.countsFilePath;
// filepath to write log to
const logFilePath = process.env.logFilePath;
// filepath to read search terms from
const termsFilePath = process.env.termsFilePath;

// compile search terms into an iterable list //
const searchTermArray = compileSearchTermsArray(termsFilePath);

// provide counts for individual search terms //
/* fs.writeFileSync(countsFilePath, "", err => {console.error("File err" + err);});
(async () => {
    for (let i = 0; i < searchTermArray.length; i++) {
        try {
            console.dir(await getAndWriteCount(searchTermArray[i]));
        } catch (e) {
            console.log(e);
        }
    }
}) (); */

const queryString = process.env.queryString;
const queryFlags = process.env.queryFlags;
console.dir(queryString + " " + queryFlags);
(async () => {
    console.dir(await getAndWriteCount(queryString + " " + queryFlags));
}) ();

// function getAndWriteCount(query) //
// takes a single query term and GETs from the twitter api v2 "counts" endpoint using the global constants above
// writes to file the daily count of tweets that match the given query term and returns the total count
async function getAndWriteCount(query) {
    let resultsCount = 0;

    console.dir(query);

    // start file writing
    fs.appendFileSync(countsFilePath, query + "\n", err => {console.error("File err" + err);});

    const params = {
        "query" : query,
        "start_time" : startTime,
        "end_time" : endTime,
        "granularity" : "day",
    };
    const headers = {
        "Authorization" : `Bearer ${process.env.bearer_token}`,
    };
    // console.time("twitter");
    let res = await get("https://api.twitter.com/2/tweets/counts/all", { params, headers }, err => {console.error("Network/request error: " + err);});
    // console.timeEnd("twitter");
    fs.appendFileSync(logFilePath, query + "\n", err => {console.error("File err: " + err);});
    fs.appendFileSync(logFilePath, JSON.stringify(res.data) + "\n", err => {console.error("File err: " + err);});

    if (res.data.data) {
        logDays(res);
        // console.time("file write");
        // fs.appendFileSync(countsFilePath, res.data.meta.total_tweet_count + ",", err => {console.error("File err: " + err);});
        // console.timeEnd("file write");
        resultsCount += res.data.meta.total_tweet_count;
    } else {
        throw new Error("Unsuccessful request");
    }

    while (res.data.meta.next_token) {
        params["next_token"] = res.data.meta.next_token;
        // console.time("twitter follow-up");
        res = await get("https://api.twitter.com/2/tweets/counts/all", { params, headers }, err => {console.error("Network/request error: " + err);});
        // console.timeEnd("twitter follow-up");
        // fs.appendFileSync(logFilePath, JSON.stringify(res.data) + "\n", err => {console.error("File err: " + err);});
        if (res.data.data) {
            logDays(res);
            // fs.appendFileSync(countsFilePath, res.data.meta.total_tweet_count + ",", err => {console.error("File err: " + err);});
            resultsCount += res.data.meta.total_tweet_count;
        } else {
            throw new Error("Unsuccessful request");
        }
    }

    // fs.appendFileSync(countsFilePath, resultsCount + "\n", err => {console.error("File err: " + err);});
    return resultsCount;
}

// compileSearchTermsArray(filePath) //
// takes a string of the filepath to a utf-8 encoded, '\r\n' delimited list of search terms
// returns the search terms in an array; individual terms are left-trimmed
function compileSearchTermsArray(filePath) {
    let termArray = [];
    let currentTerm = "";
    const data = fs.readFileSync(filePath, "utf-8");
    let i = 0;
    while (i < data.length) {
        if (data[i] == " ") {
            if (data[i + 1] == "*") {
                i++;
            } else {
                currentTerm += data[i];
                i++;
            }
        } else if (data[i] == "*" || data[i] == "\r") {
            termArray.push(currentTerm);
            currentTerm = "";
            if (data[i] == "*") {
                i += 3;
            } else {
                i += 2;
            }
        } else {
            currentTerm += data[i];
            i++;
        }
    }
    return termArray;
}

// get(url, options, errCallback) //
// an adaptor for axios.get which handles rate limiting requests
// TODO: Separate this into its own module
async function get(url, options, errCallback) {
    let nowUTCSecs = Math.floor(new Date() / 1000);
    if (nowUTCSecs >= rateWindow) {
        rateWindow =  + 900;
        remainingRate = rateLimit;
    }
    while(remainingRate <= 0) {
        console.dir("Waiting for rate window to renew! Remaining secs to renewal: " + (rateWindow - nowUTCSecs));
        if (nowUTCSecs >= rateWindow) {
            remainingRate = rateLimit;
        }
        nowUTCSecs = Math.floor(new Date() / 1000);
    }

    const response = await axios.get(url, options);
    remainingRate = response.headers["x-rate-limit-remaining"];
    rateWindow = response.headers["x-rate-limit-reset"] + 30;
    if (response.status != 200) {
        errCallback(response.toJson);
    }
    return response;
}

// logDays(res) //
// outputs the twitter counts endpoint response to a file with the format "UTC date, tweet count \n"
function logDays(res) {
    res.data.data.forEach(element => {
        fs.appendFileSync(countsFilePath, element.start + ",", err => {console.error("File err: " + err);});
        fs.appendFileSync(countsFilePath, element.tweet_count + "\n", err => {console.error("File err: " + err);});
    });
}