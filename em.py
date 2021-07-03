import os
import smtplib
from email.message import EmailMessage


def email_data(ipo_text, ipo_link):
    EMAIL_ADDRESS = os.environ.get('iponotification1@gmail.com')

    contacts = ['kritish.pokharel@gmail.com', 'aankitshrestha@gmail.com', 'kritish.pokharel@icloud.com',
                'kamana.karru@gmail.com', 'pragatiregmi101@gmail.com']

    msg = EmailMessage()
    msg['Subject'] = 'IPO ALERT!'
    msg['From'] = EMAIL_ADDRESS
    msg['To'] = contacts

    msg.set_content(ipo_text + "\n" + "Full Info: " + ipo_link)

    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
        smtp.login('iponotification1@gmail.com', 'asdfghjkl12345@')
        smtp.send_message(msg)