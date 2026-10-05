Non Functional Requirements
Building in AWS


Availability: 
Phase 1:
Local to US Alabama (us east 1?) 1 AZ
DB backup schedule needed

Durability:

Reliabilitiy: 
up 95% of time. 5% down time accecptable


Security:
    Cognito 

Cloudtrail monitors:
    Console Sign-in Failures
    Unauthorized API Calls
    IAM Policy Changes
    Trail Modifications:

Cloudwatch monitors:
    Dashboard that shows CPU usage, network traffic, and lambda invocation 
    Alerts on CPU for autoscaling 
    CloudWatch Alarm for DynamoDB
    CloudWatch Alarm for Lambda Errors, Throttling
    Cloudwatch alarm for if lambda scheduled jobs dont fire


Scalability:



Performance:
