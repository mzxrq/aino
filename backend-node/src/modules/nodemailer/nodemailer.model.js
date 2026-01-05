/** nodemailer.model.js
 *  Model for Nodemailer configurations.
 *  Defines schema and data access methods.
 */

// Define Collections Name
const COLLECTION_NAME = "nodemailer_logs";

const MailSchema = (data) => {
  return {
    from : data.from || "",
    to : data.to || "",
    subject : data.subject || "",
    text : data.text || "",
    html : data.html || "",
  };
};

// Exporting the schema
module.exports = {
  MailSchema,
  COLLECTION_NAME,
};