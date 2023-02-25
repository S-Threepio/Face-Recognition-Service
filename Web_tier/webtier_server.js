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

const { v4: uuidv4 } = require("uuid");
const app = express();
const fetch = multer({ dest: __dirname + "/upload_images" });
const port = 3000;
// Create an in-memory cache for storing responses
const responseCache = {};

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

setInterval(async () => {
  const respose_params = {
    QueueUrl: "https://sqs.us-east-1.amazonaws.com/246374075524/Response.fifo",
    WaitTimeSeconds: 1, // Set the maximum wait time for the poll
    MaxNumberOfMessages: 5, // Set the maximum number of messages to retrieve in a single poll
    AttributeNames: ["All"],
    MessageAttributeNames: ["All"],
    VisibilityTimeout: 60, // Set the visibility timeout for the retrieved messages
    ReceiveRequestAttemptId: uuidv4(), // Set a unique identifier for the receive request
  };

  try {
    const data = await sqs.receiveMessage(respose_params).promise();

    if (data.Messages) {
      for (const message of data.Messages) {
        res_json = JSON.parse(data.Messages[0].Body);
        //   res.send(req.file.originalname + " uploaded!");
        id = res_json.id;
        responseCache[id] = res_json.output;
        console.log(`Stored response in cache for id ${id}`);
      }

      const deleteParams = {
        QueueUrl:
          "https://sqs.us-east-1.amazonaws.com/246374075524/Response.fifo",
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
  } catch (error) {
    console.error(error);
  }
}, 100);

app.post("/", upload.single("myfile"), async (req, res, next) => {
  console.log(req.file);
  // push to SQS queue
  var id = uuidv4();
  const message = { url: req.file.location, id: id };
  const request_params = {
    MessageBody: JSON.stringify(message),
    QueueUrl: "https://sqs.us-east-1.amazonaws.com/246374075524/Request.fifo",
    MessageGroupId: "123",
    MessageDeduplicationId: id,
  };
  sqs.sendMessage(request_params, (err, data) => {
    if (err) {
      console.log(err);
    } else {
      console.log("Link sent to AWS SQS");
    }
  });

  // Check for response every 5 seconds until it becomes available
  const intervalId = setInterval(async () => {
    if (responseCache.hasOwnProperty(id)) {
      console.log(`Returning cached response for id ${id}`);
      clearInterval(intervalId);
      res.json(req.file.originalname + ':' + responseCache[id]);
    }
  }, 1000);
});

app.get("/", (req, res) => {
  res.send("Hello World GET!");
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
