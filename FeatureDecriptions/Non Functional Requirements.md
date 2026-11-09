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

Staying signed in:
    The coach website and the family website keep a person signed in for 60 minutes from when they last entered their
    password; the rinkside page for 4 hours (ADR-023 d6).
    The coach website should warn before the 60 minutes run out and keep unsaved work, above all in the schedule
    editor, so a long edit isn't lost to the limit.
    *(from ADR-023 §6, decided by the owner 2026-10-05; moved 2026-11-08)*

Who can see what:
    How each rule is enforced (in code and at the database) is in ADR-021, ADR-022 and ADR-024.
    A coach never sees another coach's students, lessons, profile or schedule.
        *(from ADR-021 Context, copied 2026-11-08; the ADR keeps it as the input to its decisions)*
    A client (an adult student, or a minor's parent or guardian) can:
        1. see only the students connected to them;
        2. see their coach's schedule: free and taken times, never who holds a taken one;
        3. book only with their coach.
        *(from ADR-022 Context, moved 2026-11-08; the ADR keeps the numbered list because its decisions cite it)*
    A family still waiting for approval (PENDING) sees nothing of the coach's: no schedule, no availability, no profile.
        They see only their own account: their profile, their skaters and which coach they are waiting on.
        *Decided by the owner, 2026-10-01.* *(from ADR-022 decision 6, moved 2026-11-08)*

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
