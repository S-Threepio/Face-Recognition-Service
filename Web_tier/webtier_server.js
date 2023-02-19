// improve documentation and code cleanup

const express = require("express");
const AWS = require("aws-sdk");
const multer = require("multer");
const filesystem = require("fs");
const multerS3 = require("multer-s3");
const {
  aws_accessKeyId,
  aws_secretAccessKey,
  webtier_bucket,
} = require("./utils");

const app = express();
const fetch = multer({ dest: __dirname + "/upload_images" });
const port = 3000;

// Configure AWS credentials
AWS.config.update({
  accessKeyId: aws_accessKeyId,
  secretAccessKey: aws_secretAccessKey,
  region: "us-east-1",
});

// Configure S3 bucket
const s3 = new AWS.S3({
  region: "us-east-1",
  params: { Bucket: webtier_bucket },
});

const sqs = new AWS.SQS();

// Configure multer middleware for uploading images
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: webtier_bucket,
    acl: "public-read",
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      cb(null, file.originalname);
    },
  }),
});

app.post("/", upload.single("myfile"), (req, res, next) => {
  console.log(req.file);
  // push to SQS queue
  const message = { url: req.file.location };

  const request_params = {
    MessageBody: JSON.stringify(message),
    QueueUrl: "https://sqs.us-east-1.amazonaws.com/982857252316/Request.fifo",
    MessageGroupId: "imageData",
    MessageDeduplicationId: "imageDataDuplication",
  };
  sqs.sendMessage(request_params, (err, data) => {
    if (err) {
      console.log(err);
    } else {
      console.log("Link sent to AWS SQS");
    }
  });

  const respose_params = {
    QueueUrl: "https://sqs.us-east-1.amazonaws.com/982857252316/Response.fifo",
    WaitTimeSeconds: 10, // Set the maximum wait time for the poll
    MaxNumberOfMessages: 1, // Set the maximum number of messages to retrieve in a single poll
    AttributeNames: ["All"],
    MessageAttributeNames: ["All"],
    VisibilityTimeout: 60, // Set the visibility timeout for the retrieved messages
    ReceiveRequestAttemptId: req.file.filename, // Set a unique identifier for the receive request
  };

  sqs.receiveMessage(respose_params, (err, data) => {
    // console.log("polling data", data);
    if (err) {
      console.log("Error polling SQS queue:", err);
      return res.status(500).send("Error polling SQS queue");
    }

    if (data.Messages) {
      res_json = JSON.parse(data.Messages[0].Body)
	//   res.send(req.file.originalname + " uploaded!");
	  res.send(res_json.output)
      
      const deleteParams = {
        QueueUrl:
          "https://sqs.us-east-1.amazonaws.com/982857252316/Response.fifo",
        Entries: data.Messages.map((message) => {
          return {
            Id: message.MessageId,
            ReceiptHandle: message.ReceiptHandle,
          };
        }),
      };
      sqs.deleteMessageBatch(deleteParams, (err, data) => {
        if (err) {
          console.log("Error deleting messages from SQS queue:", err);
        }
      });
    }
  });

  // set r.text
});

app.get("/", (req, res) => {
  res.send("Hello World GET!");
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
