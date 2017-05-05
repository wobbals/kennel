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
module.exports.terminateInstance = terminateInstance;

var launchClusterInstance = function() {
  return new Promise((resolve, reject) => {
    var params = {
      ImageId: config.get('cluster_instance_base_image'), /* required */
      MaxCount: 1, /* required */
      MinCount: 1, /* required */
      IamInstanceProfile: {
        Name: 'ecsInstanceRole'
      },
      InstanceInitiatedShutdownBehavior: 'terminate',
      InstanceType: 'c4.xlarge', // TODO: support multiple instance sizes
      // TODO: If we need ssh access to instances,
      // will need to figure out a strategy for KeyName (config, generate, etc)
      // KeyName: 'STRING_VALUE',
      SecurityGroupIds: [
        config.get('ec2_default_security_group')
        /* more items */
      ],
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            {
              Key: 'MANAGED_BY',
              Value: 'KENNEL'
            },
            /* more items */
          ]
        },
        /* more items */
      ]
    };
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
module.exports.launchClusterInstance = launchClusterInstance;
