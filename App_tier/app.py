import torch
import torchvision
import torchvision.transforms as transforms
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as models
from urllib.request import urlopen
from PIL import Image
import numpy as np
import json
import sys
import time
import boto3

def write_to_S3(body, key):
    s3 = boto3.client("s3")
    s3.put_object(Body=body, Bucket="cse546-apptier", Key=key + ".txt")
    print("success")


def classify_image(url,id):
    # url = str(sys.argv[1])
    img = Image.open(urlopen(url))
    # img = Image.open(url)

    model = models.resnet18(pretrained=True)

    model.eval()
    img_tensor = transforms.ToTensor()(img).unsqueeze_(0)
    outputs = model(img_tensor)
    _, predicted = torch.max(outputs.data, 1)

    with open("./imagenet-labels.json") as f:
        labels = json.load(f)
    result = labels[np.array(predicted)[0]]
    img = url.split("/")[-1]
    # save_name = f"({img_name}, {result})"
    img_name = img.split(".")[0]
    save_name = f"({img_name},{result})"
    print(f"{save_name}")
    write_to_S3(save_name, img_name)
    output = {"name": img, "output": result,"id":id}
    return json.dumps(output)




sqs = boto3.resource("sqs", region_name="us-east-1")

request_fifo = sqs.Queue(sqs.get_queue_by_name(QueueName="Request.fifo").url)
response_fifo = sqs.Queue(sqs.get_queue_by_name(QueueName="Response.fifo").url)

while 1:
    messages = request_fifo.receive_messages(
        MessageAttributeNames=["All"], MaxNumberOfMessages=10, WaitTimeSeconds=10
    )
    if not len(messages):
        break
    for msg in messages:
        print("Received url: ", msg.body)
        body = json.loads(msg.body)
        result = classify_image(body["url"],body["id"])
        response = response_fifo.send_message(
            MessageBody=result, MessageGroupId="imageData"
        )
        print(response.get("MessageId"))
        print(result)
        msg.delete()
