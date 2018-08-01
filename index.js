/*
Return Values
Your Lambda function can control mail flow by returning one of the following values:

    STOP_RULE—No further actions in the current receipt rule will be processed, but further receipt rules can be processed.

    STOP_RULE_SET—No further actions or receipt rules will be processed.

    CONTINUE or any other invalid value—This means that further actions and receipt rules can be processed.
*/
"use strict";

exports.handler = function(event, context, callback) {
    console.log("Checking for SPAM");
    
    const AWS = require("aws-sdk");
    const s3 = new AWS.S3();
    
    const simpleParser = require("mailparser").simpleParser;
    const md5 = require("md5");

    const bucketName = process.env.BUCKET_NAME;
    const s3PrefixValue = process.env.S3_PREFIX_VALUE;
    
    var sesNotification = event.Records[0].ses;
    console.log("SES Notification:\n", JSON.stringify(sesNotification, null, 2));
 
    // Check if any spam check failed
    if (sesNotification.receipt.spfVerdict.status === "FAIL"
            || sesNotification.receipt.dkimVerdict.status === "FAIL"
            || sesNotification.receipt.spamVerdict.status === "FAIL"
            || sesNotification.receipt.virusVerdict.status === "FAIL") {
        console.log("Dropping spam");
        // Stop processing rule set, dropping message
        callback(null, {"disposition":"STOP_RULE_SET"});    // No further actions or receipt rules will be processed.
    } 
    else {
        console.log("Passed SPAM check - begin to process email ...");

        // Retrieve the email from your bucket
        s3.getObject({
            Bucket: bucketName,
            Key: s3PrefixValue + sesNotification.mail.messageId
        }, function(err, data) {
            if (err) {
                console.log(err, err.stack);
                callback(err);
            }
            else {
                // console.log("Raw email:\n" + data.Body);
                simpleParser(data.Body)
                    .then(parsed => {
                        console.log("From: "    + parsed.from.text);
                        console.log("To: "      + parsed.to.text);
                        console.log("Subject: " + parsed.subject);
                        console.log("Date: "    + parsed.date);
                        console.log("Text: "    + parsed.textAsHtml);
                        console.log("Attachments: " + Object.keys(parsed.attachments).length);
                        parsed.attachments.forEach(attachment => {
                            console.log("attachment.size = " + attachment.size);
                            console.log("attachment.filename = " + attachment.filename);
                            console.log("attachment.contentType = " + attachment.contentType);
                            console.log("attachment.checksum = " + attachment.checksum);
                            console.log("md5(attachment.content) = " + md5(attachment.content));
                            s3.putObject({
                                Bucket: bucketName,
                                Key: "voicemail/" + attachment.filename,
                                Body: attachment.content //,
                                // ContentMD5: attachment.checksum
                            }, function(err, data) {
                                if (err) {
                                    console.log(err, err.stack);
                                    callback(err);
                                }
                                else {
                                    console.log("S3 putObject voicemail/" + attachment.filename
                                        + " successful, data = " + data);
                                }
                            });
                        });
                    })
                    .catch(err => {
                        console.log("simpleParser threw an error " + err);
                    });

            
                // Custom email processing goes here
                callback(null, {"disposition":"CONTINUE"}); // Further actions and receipt rules can be processed
            }
        });
    }
};
