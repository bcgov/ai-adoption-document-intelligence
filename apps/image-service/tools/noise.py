import cv2
import numpy as np
from tools import colour


def calculate_noise_metrics(image):
    """
    Generates values to measure the level of noise in an image.

    :param image: The image loaded through cv2 library.
    :returns Tuple[mean_noise, std_noise]:
    """
    # Convert the image to grayscale
    # Noise analysis should be performed on greyscale images
    gray_image = colour.toGreyscale(image)

    # Gaussian blur reduces noise
    # Args after the image:
    #   Kernel size (e.g. 5 x 5)
    #   Standard deviation of Gaussian distrobution
    blurred_image = cv2.GaussianBlur(gray_image, (5, 5), 0)

    # Calculate the noise by subtracting the blurred image from the original grayscale image
    noise = gray_image - blurred_image

    mean_noise = np.mean(noise)
    std_noise = np.std(noise)

    return mean_noise, std_noise


def denoise(image):
    """
    Attempts to denoise an image. This process also forces greyscaling.

    :param image: The image loaded through cv2 library.
    :returns result: The denoised image.
    """
    # https://docs.opencv.org/3.4/d1/d79/group__photo__denoise.html#ga4c6b0031f56ea3f98f768881279ffe93
    filter_strength = 20
    search_window = 21  # Should be odd
    template_window = 13  # Should be odd
    # Must be greyscale for this version
    grey = colour.toGreyscale(image)
    result = cv2.fastNlMeansDenoising(
        grey, filter_strength, template_window, search_window
    )
    return result


def denoise_binary(image):
    """
    Attempts to denoise an image. Forces black and white colour only.

    :param image: The image loaded through cv2 library.
    :returns result: The denoised binary image.
    """
    filter_strength = 20
    search_window = 21  # Should be odd
    template_window = 13  # Should be odd
    # Convert to greyscale then force to binary black/white
    thresh = colour.toBlackWhite(image)
    result = cv2.fastNlMeansDenoising(
        thresh, filter_strength, template_window, search_window
    )
    return result
