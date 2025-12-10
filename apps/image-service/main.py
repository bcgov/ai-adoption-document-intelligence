from fastmcp import FastMCP
from tools import noise
import cv2

# Create a server instance
mcp = FastMCP(name="image-service")


@mcp.tool()
def denoise():
    NOISE_THRESHOLD = 50  # Arbitrary value. Noisy test valued at >100
    image = cv2.imread("test-images/form1_noisy.jpg", cv2.IMREAD_UNCHANGED)
    (mean_noise, std_noise) = noise.calculate_noise_metrics(image)
    if mean_noise > NOISE_THRESHOLD:
        image = noise.denoise(image)
    cv2.imwrite("result-images/form1_noisy.jpg", image)


if __name__ == "__main__":
    mcp.run()  # Default: uses STDIO transport
