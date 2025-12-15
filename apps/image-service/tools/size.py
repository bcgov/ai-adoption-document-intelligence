import cv2
import numpy as np


def scale(image, percent):
    """
    Changes scale of an image.

    :param image: Original image
    :param percent: A percentage of what size the output should be
    """
    width = int(image.shape[1] * percent / 100)
    height = int(image.shape[0] * percent / 100)
    dim = (width, height)
    return cv2.resize(image, dim, interpolation=cv2.INTER_AREA)


def resize(image, target_width, target_height):
    """
    Resize the image to a specific width and height.

    Parameters:
        image (numpy.ndarray): The original image.
        target_width (int): Desired width.
        target_height (int): Desired height.

    Returns:
        numpy.ndarray: Resized image.
    """
    resized_image = cv2.resize(
        image, (target_width, target_height), interpolation=cv2.INTER_AREA
    )
    return resized_image


def resize_to_anchor(image, anchor):
    """
    Does not change the propotions. Width:height ratio preserved.

    :param image: The original image.
    :param anchor: An anchor with the correct size to scale against.
    """
    orb = cv2.ORB_create(nfeatures=2000)

    kp_a, des_a = orb.detectAndCompute(anchor, None)
    kp_i, des_i = orb.detectAndCompute(image, None)

    if des_a is None or des_i is None:
        raise ValueError("Failed to detect features")

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = matcher.match(des_a, des_i)

    if len(matches) < 10:
        raise ValueError("Not enough matches to estimate scale")

    scales = []
    for m in matches:
        kp_anchor = kp_a[m.queryIdx]
        kp_image = kp_i[m.trainIdx]

        if kp_anchor.size > 0:
            scales.append(kp_image.size / kp_anchor.size)

    scale = np.median(scales)

    new_w = int(image.shape[1] / scale)
    new_h = int(image.shape[0] / scale)

    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

    return resized, scale
