require("dotenv").config();

const fs = require("fs");

const axios = require("axios");
const { syncBuiltinESMExports } = require("module");

const rateLimit = 100;
const secLimit = 1000;
let rateWindow = Math.floor(new Date().getTime() / 1000) + 900;
let remainingRate = rateLimit;
let secNow = Math.floor(new Date().getTime() / 1000);

// set constants //
// the start date and time of the search
const startTime = "2020-04-01T00:00:00Z";
// the end date and time of the search
const endTime = "2020-04-30T23:59:59Z";
// filepath to write count info to
const countsFilePath = process.env.countsFilePath;
// filepath to write log to
const logFilePath = process.env.logFilePath;
// filepath to read search terms from
const termsFilePath = process.env.termsFilePath;
// filepath to write tweet ids to
const tweetsFilePath = process.env.tweetsFilePath;

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

// TODO: compile search terms into a boolean search query //
let fullQuery = `("COVID-19 symptoms" OR "covid symptoms" OR "fever" OR "skin is hot" OR "chills" OR "feel cold" OR "shivering" OR "goosebumps" OR "sore muscles" OR "muscle ache" OR "muscle pain" OR "neck ache" OR "back ache" OR "headache" OR "sore throat" OR "itchy throat" OR "nausea" OR "upset stomach" OR "sick to stomach" OR "vomiting" OR "throw up" OR "throwing up" OR "threw up" OR "diarrhea" OR "fatigue" OR "tired" OR "congestion" OR "stuffy nose" OR "runny nose" OR "nose is running" OR "cough" OR "coughing" OR "shortness of breath" OR "catch my breath" OR "difficulty breathing" OR "gasping" OR "can't breath" OR "can't smell" OR "no smell" OR "can't taste" OR "no taste" OR "confusion" OR "can't think straight" OR 
"can't concentrate" OR "foggy" OR "chest pain" OR "chest pressure" OR "weight on my chest" OR "tight chest" OR "chest tightness" OR "pale skin" OR "blue skin" OR "paleness" OR "sleepy" OR "tiredness" OR "falling asleep" OR "pneumonia")`;
(async () => {
    console.dir(await getAndWriteCount(fullQuery));
}) ();

let numReq = 0;
(async () => {
    await getTweets(fullQuery);
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
        "query" : query + " -\"RT\" -is:retweet -is:reply place_country:US",
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

// function getTweets(query) //
// takes a single query term and GETs from the twitter api v2 "counts" endpoint using the global constants above
// writes to file the daily count of tweets that match the given query term and returns the total count
async function getTweets(query) {

    const params = {
        "query" : query + " -\"RT\" -is:retweet -is:reply lang:en place_country:US",
        "start_time" : startTime,
        "end_time" : endTime,
        "tweet.fields" : "created_at",
        "max_results" : 500,
    };
    const headers = {
        "Authorization" : `Bearer ${process.env.bearer_token}`,
    };

    let res = await get("https://api.twitter.com/2/tweets/search/all", { params, headers }, err => {console.error("Network/request error: " + err);});
    secNow = Math.floor(new Date().getTime() / 1000);

    if (res.data.data) {
        logTweets(res);
    } else {
        throw new Error("Unsuccessful request");
    }

    while (res.data.meta.next_token) {
        params["next_token"] = res.data.meta.next_token;

        while (((Math.floor(new Date().getTime() / 1000)) - secNow) < 1.2) {
            // This is a crappy delay for the 1 sec rate limit for Twitter API v2 searches
        }
        res = await get("https://api.twitter.com/2/tweets/search/all", { params, headers }, err => {console.error("Network/request error: " + err.data);});
        secNow = Math.floor(new Date().getTime() / 1000);

        if (res.data.data) {
            logTweets(res);
        } else {
            throw new Error("Unsuccessful request");
        }
    }
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

function logTweets(res) {
    fs.appendFileSync(tweetsFilePath, JSON.stringify(res.data.data), err => {console.error("File err: " + err);});
    console.dir(res.data.data[0]["created_at"]);
}