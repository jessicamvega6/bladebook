# A new account with no group

*Ruling I27 (owner, 2026-11-18); ADR-023 d10, as amended; ADR-MASTER §2, §19.*

## When

The `auth-post-confirmation-errors` alarm pages: the trigger that gives a new account its group (`Coach` or `Client`)
failed. Cognito had already confirmed the account, so it has no group, and both APIs refuse its tokens. The person
sees an error after entering their code and can't sign in usefully. They can't fix it themselves.

## Find the account

The trigger's log (`/aws/lambda/<prefix>-auth-post-confirmation`) has the failed run. Cognito's event names the user
pool and the account's `userName` (its `sub`). List accounts with no group if the log is unclear:

```sh
aws cognito-idp list-users --user-pool-id <pool> --filter 'cognito:user_status = "CONFIRMED"' --profile <profile>
```

and check each recent one with `admin-list-groups-for-user`.

## Which group

The same rule as the trigger: **by the app client the person signed up through, never by what they say.** The failed
event's `callerContext.clientId` is that client: the coach website's (`coach-web`) means `Coach`; the family
website's (`family-web`) means `Client`. If the event is gone and it can't be told, ask which website they signed
up on, and confirm it from their sign-up email's link before adding anything.

## Add it

```sh
aws cognito-idp admin-add-user-to-group --user-pool-id <pool> --username <sub> --group-name Coach   # or Client
```

Then ask them to sign in again (the website refreshes its tokens on sign-in), and check the trigger's log for why it
failed.
