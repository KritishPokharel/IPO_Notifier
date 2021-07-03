file_object = open('links.txt', 'a')
import em
with open("links.txt") as file_in:
    lines = []
    for line in file_in:
        lines.append(line.strip())


def check(ipo_link,ipo_text):
    link = ipo_link
    if link not in lines:
        print("Not matched")
        em.email_data(ipo_text, ipo_link)
        file_object.write(ipo_link)
        file_object.write("\n")



