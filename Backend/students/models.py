from django.db import models

# Create your models here.
class Student(models.Model):
    name=models.CharField(max_length=100)
    year=models.IntegerField()
    email=models.EmailField(max_length=100)
    phone=models.CharField(max_length=15)
    branch=models.CharField(max_length=50)
    semester=models.CharField(max_length=10)

    def __str__(self):
        return self.name