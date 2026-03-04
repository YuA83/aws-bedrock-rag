const { SESClient, SendTemplatedEmailCommand } = require("@aws-sdk/client-ses");

const TEMPLATE = "PocContactAiAnswer";
const SENDER = "no-reply@localdigital.kr";

// ses client
const sesClient = new SESClient({ region: "ap-northeast-2" });


const createReminderEmailCommand = (
    toAddress,
    title,
    content,
    answer,
    url
) => {

  return new SendTemplatedEmailCommand({
    Template: TEMPLATE,
    TemplateData: JSON.stringify({ title, content, answer, url }),
    Source: SENDER,
    Destination: { ToAddresses: [ toAddress ] }
  });
};

module.exports = {createReminderEmailCommand};