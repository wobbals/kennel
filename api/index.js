var express = require('express');
var router = express.Router();
var debug = require('debug')('kennel:api');
var config = require('config');
var task = require('../helper/task');
var taskModel = require('../model/taskModel');

router.post('/task', function(req, res, next) {
  task.createTask(req.body)
  .then(result => {
    res.status(202);
    res.json(result);
  }, error => {
    res.status(400);
    res.json(result);
  });
});

router.get('/task/:id', function(req, res, next) {
  taskModel.getTask(req.params.id).then(result => {
    res.json(result);
    res.status(200);
  }, err => {
    res.json(err);
    res.json(404);
  });
});

router.get('/', function(req, res, next) {
  res.json({message: 'HELLO? YES, THIS IS KENNEL.'});
});

module.exports = router;
