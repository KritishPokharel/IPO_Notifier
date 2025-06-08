import os
import em


def _load_links():
    if not os.path.exists('links.txt'):
        return set()
    with open('links.txt') as file_in:
        return set(line.strip() for line in file_in)


links = _load_links()


def check(ipo_link,ipo_text):
    if ipo_link not in links:
        print("Not matched")
        em.email_data(ipo_text, ipo_link)
        links.add(ipo_link)
        with open('links.txt', 'a') as file_object:
            file_object.write(ipo_link + "\n")



