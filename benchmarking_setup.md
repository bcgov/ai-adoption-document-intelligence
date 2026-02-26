Install DVC:

sudo apt install wget gpg
sudo mkdir -p /etc/apt/keyrings
wget -qO - https://dvc.org/deb/iterative.asc | sudo gpg --dearmor -o /etc/apt/keyrings/packages.iterative.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/packages.iterative.gpg] https://dvc.org/deb/ stable main" | sudo tee /etc/apt/sources.list.d/dvc.list
sudo chmod 644 /etc/apt/keyrings/packages.iterative.gpg /etc/apt/sources.list.d/dvc.list
sudo apt update
sudo apt install dvc



For DVC URL, can use:
~/datasets/my-test-dataset