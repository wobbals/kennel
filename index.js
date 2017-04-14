const AWS = require('aws-sdk');
const config = require('config');
const ecs = new AWS.ECS({
  accessKeyId: config.get("aws_token"),
  secretAccessKey: config.get("aws_secret"),
  region: config.get('ecs_region')
});

var command = "node task.js --width 640 --height 360 --cssPreset auto"
var params = 
{
  taskDefinition: "barc-single-task:4",
  cluster: config.get("ecs_cluster_name"),
  count: 1,
  overrides: {
    containerOverrides: [
      {
        command: command.split(' '),
        environment: [
          { name: 'DEBUG', value: '*.*' },
          { name: 'ARCHIVE_URL', value: "https://s3.amazonaws.com/artifact.tokbox.com/charley/barc/audio_sync.zip" },
          { name: 'TASK_ID', value: "my-first-kennel-task" },
          { name: 'S3_SECRET', value: "" },
          { name: 'S3_TOKEN', value: "" },
          { name: 'S3_BUCKET', value: "tb-charley-test.tokbox.com" },
          { name: 'S3_PREFIX', value: "barc-task-ecs" },
          { name: 'S3_REGION', value: "us-west-2" },
          /* more items */
        ],
        name: 'barc-task-dockerub'
      }
    ]
  },
  startedBy: 'danger'
};
 
ecs.runTask(params, function(err, data) {
  if (err) console.log(err, err.stack); // an error occurred
  else     console.log(data);           // successful response
   /*
   data = {
    tasks: [
       {
      containerInstanceArn: "arn:aws:ecs:us-east-1:<aws_account_id>:container-instance/ffe3d344-77e2-476c-a4d0-bf560ad50acb", 
      containers: [
         {
        name: "sleep", 
        containerArn: "arn:aws:ecs:us-east-1:<aws_account_id>:container/58591c8e-be29-4ddf-95aa-ee459d4c59fd", 
        lastStatus: "PENDING", 
        taskArn: "arn:aws:ecs:us-east-1:<aws_account_id>:task/a9f21ea7-c9f5-44b1-b8e6-b31f50ed33c0"
       }
      ], 
      desiredStatus: "RUNNING", 
      lastStatus: "PENDING", 
      overrides: {
       containerOverrides: [
          {
         name: "sleep"
        }
       ]
      }, 
      taskArn: "arn:aws:ecs:us-east-1:<aws_account_id>:task/a9f21ea7-c9f5-44b1-b8e6-b31f50ed33c0", 
      taskDefinitionArn: "arn:aws:ecs:us-east-1:<aws_account_id>:task-definition/sleep360:1"
     }
    ]
   }
   */
 });