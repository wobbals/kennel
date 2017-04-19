var kue = require('kue');
var queue = kue.createQueue();
var cluster = require('../helper/cluster');
var debug = require('debug')('worker:scheduler');

queue.process('runTask', function(job, done){
  runTask(job, done);
});

queue.process('cleanup', function(job, done) {
  let taskArns = job.data;
  debug(`cleanup checking in on ${taskArns}`);
  cluster.cleanupAfterTasks(taskArns);
  done();
});

queue.process('', function(job, done) {
  cluster.autoResize();
  done();
});

debug(`connected to queue redis at ${queue.client.address}`);
debug(`worker standing by`);

function runTask(job, done) {
  cluster.canRunTaskImmediately(job.data).then((hasResources) => {
    if (!hasResources) {
      debug(`no instances available. launch instance and try again later`);
      // add resources and try again later
      cluster.launchInstance().then(() => {
        tryAgainLater(job, 120);
        done();
      }, (err) => {
        debug(`instance launch failure. what do? ${err}`);
      });
    } else {
      debug(`job ${job.id} can be scheduled immediately. requesting runTask`);
      cluster.runTask(job.data).then((result) => {
        let taskArns = [];
        result.tasks.forEach((task) => {
          taskArns.push(task.taskArn);
        });
        scheduleCleanup(taskArns, 300);
        scheduleCleanup(taskArns, 3600);
        done();
      }, (err) => {
        debug(`failed to schedule job ${job.id}`);
        done(err);
      });
    }
  });
};

function tryAgainLater(job, seconds) {
  let deferredJob = queue.create('runTask', job.data)
  .delay(seconds * 1000)
  .priority('high')
  .removeOnComplete(true)
  .save();
  debug(`Retry job ${job.id} in ${seconds} seconds`);
}

function scheduleCleanup(taskArns, seconds) {
  debug(`scheduleCleanup: check in on tasks ${taskArns} in ${seconds} seconds`);
  let deferredJob = queue.create('cleanup', taskArns)
  .delay(seconds * 1000)
  .removeOnComplete(true)
  .save();
}

function resizeAfter(seconds) {
  debug(`resizeAfter: request cluster resize in ${seconds} seconds`);
  let deferredJob = queue.create('clusterResize', {})
  .delay(seconds * 1000)
  .removeOnComplete(true)
  .save();
}

cluster.autoResize();
