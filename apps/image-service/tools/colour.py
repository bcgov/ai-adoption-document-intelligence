import cv2


def toGreyscale(image):
    grey = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return grey


def toBlackWhite(image):
    grey = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    result = cv2.threshold(grey, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    return result
