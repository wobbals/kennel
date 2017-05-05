const config = require('config');
const AWS = require('aws-sdk');

let awsConfig = {};
if (config.has('aws_token')) {
  awsConfig.accessKeyId = config.get('aws_token');
}
if (config.has('aws_secret')) {
  awsConfig.secretAccessKey = config.get('aws_secret');
}
awsConfig.region = config.get('ecs_region');

const ecs = new AWS.ECS(awsConfig);
const ec2 = new AWS.EC2(awsConfig);

module.exports.ecs = ecs;
module.exports.ec2 = ec2;