As of now schedule creation will have

  Name (optional): allows the coach to save a schedule. Applying it will be a phase 2 feature. Is stored on the schedule object.
  (SOD)Start of Day : A dropdown filled from 12am - 11:45pm in 15 minute intervals
  (EOD)End of Day: A dropdown filled from 12am - 11:45pm in 15 minute intervals
  (LL)length of lesson (in mins): a dropdown with 30,45,60,90,120 in the list. 
  (LC)Lesson Cost: the cost of the lesson. represented in the currency selected on sign up. MVP the currency is USD or canadian. 
  (Days)Days this Schedule needs to repeat: wih 7 checkboxes representing sun - sat. For default view Days are manditory, for temp view they are not shown.
  (SD) Start Date: For temporary schedules the date the schedule needs to start. Only shown for temp Schedules
  (ED) End Date: For temporary schedules the date the schedule needs to stop. Only shown for temp Schedules   

There will be a calendar view to the right where on entering in both a start of day and length of lesson, slots will auto popululate starting at the start of day time with the lesson duration. It will go until the End of Day time if that has a value or will stop at 7pm. 7pm is not a hard stop but just a helpful prefill. The coach can add more slots by sleceting them on the schdeule view or by modifying the EOD field. 

The calendar view will have tabs, one to start --- with a + button next to it. On click of the + btn a new tab will appear next to the previous schedule tab and the SOD, EOD, LL, & Days will reset to blank. Each tab will have a X next to it that when clicked deletes that tab schedule. There must be at least one schedule always for the next button to be enabled. When there is only one schedule in the view, that schedule will not have an X button until the + btn is clicked again. 

Clicking a lesson slot on the schedule will select or deselect that lesson. If the LL is not defined when clicking on the schedule, the slot length will default to 30 mins. and will auto fill the LL input. 


The view will be used for both the Default and the Temp. A radio button will indicate if schedule needs to be for default or temporary. 

On click of Next, user will be taken to validation / confirmation page. the system Will validate that no schedule has overlapping times on the same day and will also check any existing temp schedules for date/time overlap. IF there are validation errors, a message will be presented to the user describging the issue. If no validation errors, will present to user the schedule for confirmation. For both schedule types (temp/default) it will also present any bookings that will get canceled, and how long the schedule will run for. For temps until the end date, for defaults indefinately. A message will display to the coach that on accept cancelation emails will be sent to clients with canceled bookings. The coach must accept before any bookings are canceled. 


A saved named schedule is able to be reloaded and then modified. 





Business Decision:
For canceling see document labeled cancelation.md.
