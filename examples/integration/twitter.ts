// Copyright 2016-2018, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { poll } from "./poll";
import * as utils from "./utils";

// Consumer key and secret from https://apps.twitter.com/.  Create a new app and request a
// request these to make API requests on behalf of the logged in account.
let config = new pulumi.Config("twitter");
let twitterConsumerKey = config.require("consumer_key");
let twitterConsumerSecret = config.require("consumer_secret");

let bearerTable = new cloud.Table("bearer");

async function getTwitterAuthorizationBearer(): Promise<string> {
    let keyAndSecret = twitterConsumerKey + ":" + twitterConsumerSecret;
    let cachedToken = await bearerTable.get({ id: keyAndSecret });

    if (cachedToken === undefined) {
        console.log("Bearer token not in cache. Retrieving from twitter...");
        let credentials = new Buffer(keyAndSecret).toString("base64");

        let url = "https://api.twitter.com/oauth2/token";

        let request = require("request-promise-native");
        let body = await request({
            url: url,
            method: "POST",
            headers: {
                "Authorization": "Basic " + credentials,
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            },
            body: "grant_type=client_credentials",
            json: true,
        });

        let accessToken = body.access_token;
        cachedToken = { id: keyAndSecret, access_token: accessToken };
        await bearerTable.insert(cachedToken);
    }

    console.log("Bearer token: " + cachedToken.access_token);

    return cachedToken.access_token;
}

// Search returns a stream of all tweets matching the search term.
export function search(name: string, term: string): cloud.Stream<Tweet> {
    console.log("Creating poll...");
    let searchPoll = poll<Tweet>(name, {minutes: 1}, async (lastToken) => {
        console.log("Getting bearer token...");
        let bearerToken = await getTwitterAuthorizationBearer();

        console.log("Running poll...");
        let request = require("request-promise-native");
        let querystring = lastToken;
        if (lastToken === undefined) {
            querystring = `?q=${term}`;
        }
        console.log("Requesting twitter data...");

        let url = "https://api.twitter.com/1.1/search/tweets.json" + querystring;
        console.log("Url: " + url);

        let body = await request({
            url: url,
            headers: {
                "Authorization": "Bearer " + bearerToken,
            },
        });

        let data = <TwitterSearchResponse>JSON.parse(body);

        console.log(utils.toShortString(`Twitter response: ${JSON.stringify(data, null, "")}`));
        return {
            nextToken: data.search_metadata.refresh_url,
            items: data.statuses,
        };
    });

    return searchPoll;
}

interface TwitterSearchResponse {
    statuses: Tweet[];
    search_metadata: {
        max_id_str: string;
        since_id_str: string;
        refresh_url: string;
        next_results: string;
    };
}

export interface Tweet {
    text: string;
    id_str: string;
    created_at: string;
    user: {
        screen_name: string;
    };
}
