from fastmcp import FastMCP
from tools.noise import denoise

# Create a server instance
mcp = FastMCP(name="image-service")

if __name__ == "__main__":
    mcp.run()  # Default: uses STDIO transport
