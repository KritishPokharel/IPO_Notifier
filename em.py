import os
import smtplib
from email.message import EmailMessage


def email_data(ipo_text, ipo_link):
    # Replace with your email address or set the environment variable
    # `LOGIN_EMAIL_ADDRESS` and `LOGIN_PASSWORD`.
    EMAIL_ADDRESS = os.environ.get('LOGIN_EMAIL_ADDRESS')

    # List of emails to notify.
    contacts = ['Enter the emails to send the alert']

    msg = EmailMessage()
    msg['Subject'] = 'IPO ALERT!'
    msg['From'] = EMAIL_ADDRESS
    msg['To'] = contacts

    msg.set_content(ipo_text + "\n" + "Full Info: " + ipo_link)

    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
        smtp.login(
            os.environ.get('LOGIN_EMAIL_ADDRESS'),
            os.environ.get('LOGIN_PASSWORD'),
        )
        smtp.send_message(msg)
