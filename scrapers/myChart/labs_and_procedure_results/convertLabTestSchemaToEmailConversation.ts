// import { Conversation } from "../types";
// import { LabTestResult } from "./labtestresulttype";



// function convert(labTestSchema: LabTestResult) {

//   let message = []

//   for (let result of labTestSchema.results) {
//     for(let component of result.resultComponents) {
//       component.componentInfo + ': ' + component.componentInfo.name
//     }

//   }

//   let email: Conversation = {
//     id: 'lab-test-' + labTestSchema.key,
//     subject: 'Lab Test Result:' + labTestSchema.orderName,
//     users: [{
//       name: 'Lab Test Result',
//       isProvider: true,
//       id: labTestSchema.key
//     }],
//     messages: [
//       {
//         messageId: 'lab-test-' + labTestSchema.key + '-msg1',
//         userId: labTestSchema.key,

//         // might need to format this differently
//         timestamp: labTestSchema.results[0].orderMetadata.resultTimestampDisplay,
//         message: 'Lab Test Result: ' + labTestSchema.orderName
//       }
//       }
//     ]
//   }


	
// }