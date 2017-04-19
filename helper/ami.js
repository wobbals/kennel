var config = require('config');
var AWS = require('aws-sdk');
var ec2 = new AWS.EC2({
  accessKeyId: config.get("aws_token"),
  secretAccessKey: config.get("aws_secret"),
  region: config.get('ecs_region')
});

/*
This is not a function that would likely be used in the webservice at least
until there's some form of management interface, but it is necessary to
occasionally build new preconfigured images for the cluster. I found this useful
in reproducing the recommendations laid out in this GH issue for ecs-agent:
https://github.com/aws/amazon-ecs-agent/issues/419#issuecomment-228433471

A really ambitious dev or ops might consider hooking this into SNS for the
latest Amazon authored AMIs (see the ecs-optimized-amazon-ami-update SNS topics)
to trigger rebuilds of the base image. The newly created preconfigured image
should be fed back into whatever the instance.js addClusterInstance function
pulls for configuring new instances to autojoin the cluster.
*/
var registerAMI = function(rootSnapshotId) {
  var params = {
    Name: 'ecs-kennel-test-ami', /* required */
    Architecture: 'x86_64',
    BlockDeviceMappings: [
      {
        DeviceName: '/dev/xvda',
        Ebs: {
          DeleteOnTermination: true ,
          SnapshotId: rootSnapshotId,
          VolumeSize: 8,
          VolumeType: 'gp2'
        }
      },
      {
        DeviceName: '/dev/xvdcz',
        Ebs: {
          DeleteOnTermination: true ,
          VolumeSize: 22,
          VolumeType: 'gp2'
        }
      }
    ],
    Description: 'Preconfigured AMI for kennel ECS cluster instance',
    RootDeviceName: '/dev/xvda',
    VirtualizationType: 'hvm'
  };
  ec2.registerImage(params, function(err, data) {
    if (err) console.log(err, err.stack); // an error occurred
    else     console.log(data);           // successful response
  });
}
