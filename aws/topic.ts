// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as types from "@pulumi/pulumi";
import * as sns from "./sns";

export class Topic<T> implements types.Topic<T> {
    // Inside + Outside API

    private name: string;
    private topic: aws.sns.Topic;

    // Inside API

    public publish: (item: T) => Promise<void>;

    // Outside API (constructor and methods)

    constructor(name: string) {
        this.name = name;
        this.topic = new aws.sns.Topic(name, {});
        // TODO[pulumi/pulumi-fabric#331]: bring this back once deadlock issues are resolved.
        // this.subscriptions = [];
        this.publish = (item) => {
            let awssdk = require("aws-sdk");
            let snsconn = awssdk.SNS();
            return new snsconn.publish({
                Message: JSON.stringify(item),
                TopicArn: this.topic.id,
            }).promise();
        };
    }

    public subscribe(name: string, handler: (item: T) => Promise<void>) {
        sns.createSubscription(this.name + "_" + name, this.topic, async (snsItem: sns.SNSItem) => {
            let item = JSON.parse(snsItem.Message);
            await handler(item);
        });
    }
}
