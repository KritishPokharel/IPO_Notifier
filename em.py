import os
import smtplib
from email.message import EmailMessage


def email_data(ipo_text, ipo_link):
    EMAIL_ADDRESS = os.environ.get('Login Email address')//Change it with your email address

    contacts = ['Enter the emails to send the alert'] //list all the emails you want to send the alert

    msg = EmailMessage()
    msg['Subject'] = 'IPO ALERT!'
    msg['From'] = EMAIL_ADDRESS
    msg['To'] = contacts

    msg.set_content(ipo_text + "\n" + "Full Info: " + ipo_link)

    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
        smtp.login('Login Email address', 'Login Password')//Enter your email adress and password
        smtp.send_message(msg)
