var config = require('config');
var debug = require('debug')('kennel:instance');
var AWS = require('aws-sdk');
var ecs = new AWS.ECS({
  accessKeyId: config.get("aws_token"),
  secretAccessKey: config.get("aws_secret"),
  region: config.get('ecs_region')
});
var ec2 = new AWS.EC2({
  accessKeyId: config.get("aws_token"),
  secretAccessKey: config.get("aws_secret"),
  region: config.get('ecs_region')
});

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
      InstanceType: 't2.micro', // TODO: Add support for multiple instance types
      // TODO: If we need ssh access to instances,
      // will need to figure out a strategy for KeyName (config, generate, etc)
      // KeyName: 'STRING_VALUE',
      SecurityGroupIds: [
        config.get('ec2_default_security_group')
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
        });
        resolve(data);
      }
    });
  });
};
module.exports.launchClusterInstance = launchClusterInstance;
