import cv2
import numpy as np


def calculate_noise_metrics(image):
    # Convert the image to grayscale
    # Noise analysis should be performed on greyscale images
    gray_image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

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


def denoise():
    image = cv2.imread("test-images/form1_noisy.jpg", cv2.IMREAD_UNCHANGED)
    print(calculate_noise_metrics(image))
    cv2.imwrite("result-images/form1_noisy.jpg", image)
    return calculate_noise_metrics(image)
