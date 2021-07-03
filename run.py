import requests
from bs4 import BeautifulSoup
import no_repitation
page = requests.get("https://merolagani.com/Ipo.aspx?type=upcoming")
soup = BeautifulSoup(page.content, 'html.parser')
try:
    i = 0
    while i <= 100:
        info = soup.find(id='ctl00_ContentPlaceHolder1_rptLatestAnnouncement_ctl0'+str(i)+'_LatestAnnouncement_divAnnoucement')
        data = info.find(class_='media-body')
        text = data.get_text()
        link = data.find('a')['href']
        ipo_link = "https://merolagani.com"+link
        ipo_text = text.strip()
        no_repitation.check(str(ipo_link),ipo_text)
        i = i+1
except:
    print("No new IPO published")
