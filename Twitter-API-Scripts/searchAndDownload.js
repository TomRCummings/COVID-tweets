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
// filepath to write tweet ids to
const tweetsFilePath = process.env.tweetsFilePath;
// query string and flags for the twitter api
const queryString = process.env.queryString;
const queryFlags = process.env.queryFlags;

(async () => {
    await getTweets(queryString + " " + queryFlags);
}) ();

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

// logTweets(res) //
// each response from the twitter api is sent here to be printed to file
function logTweets(res) {
    fs.appendFileSync(tweetsFilePath, JSON.stringify(res.data.data), err => {console.error("File err: " + err);});
    console.dir(res.data.data[0]["created_at"]);
}