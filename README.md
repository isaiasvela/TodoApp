# Family Todo App – Professional Edition

A simple web application to manage shared tasks for a family or household, now built with professional deployment practices and cloud infrastructure.

## Features

- Create, complete, and delete tasks  
- Persistent storage using **PostgreSQL** (instead of SQLite)  
- Secure access with **HTTPS**  
- Backend and frontend separated  
- Automated **CI/CD** pipelines for build and deployment  
- Infrastructure as Code with **Terraform** on AWS  

## Tech Stack

- **Frontend:** React
- **Backend:** Node.js + Express  
- **Database:** PostgreSQL (hosted on AWS RDS)  
- **Containerization:** Docker  
- **CI/CD:** GitHub Actions  
- **Hosting / Cloud:** AWS (EC2, ALB/ELB for HTTPS, optional S3 for static assets)  
- **Infrastructure as Code:** Terraform  

## Deployment

1. Provision infrastructure with Terraform: EC2 instances, security groups, RDS, etc.  
2. Build Docker containers for backend and frontend.  
3. Push images to GitHub Container Registry (GHCR) or AWS ECR.  
4. Deploy containers on EC2 or ECS.  
5. Access your app securely via HTTPS (use ALB or Nginx with Let's Encrypt).  

## CI/CD

- GitHub Actions workflows:
  - **Build:** Lint, test, and build Docker images
  - **Push:** Publish images to registry
  - **Deploy:** Update EC2 instances or ECS services automatically

## Notes

- Make sure to create a **Terraform key pair** for SSH access to EC2.  
- Configure security groups to allow **SSH (22)** and **HTTPS (443)**.  
- Use environment variables or secrets for database credentials and API keys.  

## License

MIT
