# Kennel: Task queue for Amazon ECS

Amazon ECS is awesome, but requests for tasks that do not have resources are
doomed to fail when cluster instances are not available to run the task.
In some cases, it is not appritate to leave instances waiting for tasks to be
scheduled. Kennel defers incoming RunTask requests to a job queue, and manages
the ECS cluster that will ultimately run the job.

## Requesting a job

## Configuring cluster behavior

In cases where immediate execution is necessary, warm instances can be kept
running.
