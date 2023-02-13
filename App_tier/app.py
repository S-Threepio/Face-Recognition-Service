import boto3
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


sqs = boto3.resource('sqs', region_name='us-east-1')

# for queue in sqs.queues.all():
#     print(queue.url)


request_fifo = sqs.Queue(sqs.get_queue_by_name(QueueName='Request.fifo').url)
response_fifo = sqs.Queue(sqs.get_queue_by_name(QueueName='Response.fifo').url)

while(1) :
        messages = request_fifo.receive_messages(MessageAttributeNames=['All'],MaxNumberOfMessages=10,WaitTimeSeconds=10)
        if not len(messages):
                break
        for msg in messages:
                print("Received message: %s: %s", msg.message_id, msg.body)
                message = predict(url)
                response = response_fifo.send_message(MessageBody=message,MessageGroupId='imageData')
                print(response.get('MessageId'))                
                msg.delete()


def predict(url) :
        url = str(sys.argv[1])
        #img = Image.open(urlopen(url))
        img = Image.open(url)

        model = models.resnet18(pretrained=True)

        model.eval()
        img_tensor = transforms.ToTensor()(img).unsqueeze_(0)
        outputs = model(img_tensor)
        _, predicted = torch.max(outputs.data, 1)

        with open('./imagenet-labels.json') as f:
        labels = json.load(f)
        result = labels[np.array(predicted)[0]]
        img_name = url.split("/")[-1]
        #save_name = f"({img_name}, {result})"
        save_name = f"{img_name},{result}"
        print(f"{save_name}")