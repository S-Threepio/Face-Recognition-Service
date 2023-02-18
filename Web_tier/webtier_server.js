// improve documentation and code cleanup

const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const filesystem = require('fs');
const multerS3 = require('multer-s3');

const app = express();
const fetch = multer({dest: __dirname + '/upload_images'})
const port = 3000;


// Configure AWS credentials
AWS.config.update({
        accessKeyId: 'AKIA6JVW3PXOAANILSLQ',
        secretAccessKey: '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',
        region: 'us-east-1'
});

// Configure S3 bucket
const s3 = new AWS.S3({
        region: 'us-east-1',
        params: { Bucket: 'web-tier546' }
});

const sqs = new AWS.SQS();

// Configure multer middleware for uploading images
const upload = multer({
        storage: multerS3({
          s3: s3,
          bucket: 'web-tier546',
          acl: 'public-read',
          metadata: function (req, file, cb) {
                cb(null, {fieldName: file.fieldname});
          },
          key: function (req, file, cb) {
                cb(null, file.originalname);
          }
        })
});

app.post('/', upload.single('myfile'), (req, res, next) => {
        console.log(req.file)
        // push to SQS queue
        const message = {url : req.file.location};

        const params = { MessageBody: JSON.stringify(message), QueueUrl: 'https://sqs.us-east-1.amazonaws.com/982857252316/Request.fifo', MessageGroupId:'imageData', MessageDeduplicationId: "imageDataDuplication"};
        sqs.sendMessage(params, (err, data) => {
                if(err) {
                        console.log(err);
                }else{
                console.log("Link sent to AWS SQS");
                }
        });
        // set r.text

        res.send(req.file.originalname + ' uploaded!');
});

app.get('/', (req, res) => {
        res.send("Hello World GET!");
});

app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
});
