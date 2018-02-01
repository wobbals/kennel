var config = require('config');
var debug = require('debug')('kennel:instance');
var AWS = require('aws-sdk');
var ecs = require('./aws').ecs;
var ec2 = require('./aws').ec2;
var Instance = require('../model/instanceModel');

var terminateInstance = function(instanceId) {
  debug(`terminate instance ${instanceId}`);
  return new Promise((resolve, reject) => {
    var params = {
      InstanceIds: [
        instanceId
      ]
    };
    ec2.terminateInstances(params, function(err, data) {
      if (err) {
        debug(`failed to terminate instance: ${err}`);
        reject(err);
      } else {
        debug(`instance ${instanceId} terminated`);
        resolve(data);
      }
    });
  });
}

var launchClusterInstance = function(taskId) {
  let userDataScript = `#!/bin/bash
echo "ECS_CLUSTER=${config.get('ecs_cluster_name')}" >> /etc/ecs/ecs.config
  `;
  let userData = new Buffer(userDataScript).toString('base64');
  return new Promise((resolve, reject) => {
    var params = {
      ImageId: config.get('cluster_instance_base_image'), /* required */
      MaxCount: 1, /* required */
      MinCount: 1, /* required */
      IamInstanceProfile: {
        Name: 'ecsInstanceRole'
      },
      InstanceInitiatedShutdownBehavior: 'terminate',
      InstanceType: 'c4.2xlarge', // TODO: support multiple instance sizes
      // TODO: If we need ssh access to instances,
      // will need to figure out a strategy for KeyName (config, generate, etc)
      // KeyName: 'STRING_VALUE',
      SecurityGroupIds: [
        config.get('ec2_default_security_group')
        /* more items */
      ],
      UserData: userData
    };
    let tags = [];
    if (taskId) {
      debug(`earmarking instance request for ${taskId}`);
      tags.push({
        Key: 'EARMARK',
        Value: taskId
      });
    }
    tags.push({
      Key: 'MANAGED_BY',
      Value: 'KENNEL'
    });
    params.TagSpecifications = [{
      ResourceType: 'instance',
      Tags: tags
    }];
    ec2.runInstances(params, function(err, data) {
      if (err) {
        debug(`error launching new cluster instance: ${err}`);
        reject(err);
      } else {
        data.Instances.forEach((anInstance) => {
          debug(`succesfully launched new instance ${anInstance.InstanceId}`);
          Instance.registerInstance(anInstance.InstanceId);
        });
        resolve(data);
      }
    });
  });
};

function describeInstance(instanceId) {
  return new Promise((resolve, reject) => {
    var params = {
      InstanceIds: [
        instanceId
        /* more items */
      ]
    };
    ec2.describeInstances(params, function(err, data) {
      if (err) {
        debug(`describeInstance: ${err}`);
        reject(err);
      } else {
        debug(`describeInstance: ${data}`);
        resolve(data);
      }
    });
  });
}

function getInstanceTags(instanceId) {
  return new Promise((resolve, reject) => {
    var params = {
      Filters: [
        {
          Name: "resource-id",
          Values: [
            instanceId
          ]
        }
      ]
    };
    ec2.describeTags(params, function(err, data) {
      if (err) {
        debug(`getInstanceTags: error: ${err}`);
        reject(err);
      } else {
        resolve(data.Tags);
      }
    });
  });
}

module.exports = {
  launchClusterInstance,
  terminateInstance,
  describeInstance,
  getInstanceTags
}
