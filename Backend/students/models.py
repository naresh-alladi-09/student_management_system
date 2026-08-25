from django.db import models

# Create your models here.
class Student(models.Model):
    name=models.CharField(max_length=100)
    year=models.CharField(max_length=20)
    email=models.EmailField()
    phone=models.CharField(max_length=15)
    branch=models.CharField(max_length=50)
    Semester=models.CharField(max_length=10)

    def __str__(self):
        return self.name